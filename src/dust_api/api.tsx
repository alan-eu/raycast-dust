import fetch from "node-fetch";
import { createParser } from "eventsource-parser";
import got from "got";
import { AgentActionType, ConversationType, UserMessageType } from "./conversation";
import { useDustCredentials } from "../credentials";
import { useEffect, useState } from "react";

export type DustAPICredentials = {
  apiKey: string;
  workspaceId: string;
};

const DUST_API_URL = "https://dust.tt/api/v1/w";

export type AgentActionSuccessEvent = {
  type: "agent_action_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: AgentActionType;
};

// Event sent when tokens are streamed as the the agent is generating a message.
export type GenerationTokensEvent = {
  type: "generation_tokens";
  created: number;
  configurationId: string;
  messageId: string;
  text: string;
};

// Event sent once the generation is completed.
export type AgentGenerationSuccessEvent = {
  type: "agent_generation_success";
  created: number;
  configurationId: string;
  messageId: string;
  text: string;
};

// Event sent when the user message is created.
export type UserMessageErrorEvent = {
  type: "user_message_error";
  created: number;
  error: {
    code: string;
    message: string;
  };
};

// Generic event sent when an error occured (whether it's during the action or the message generation).
export type AgentErrorEvent = {
  type: "agent_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};

export type GenerationSuccessEvent = {
  type: "generation_success";
  created: number;
  configurationId: string;
  messageId: string;
  text: string;
};

function cleanupEventText(text: string) {
  return text.replace(/:cite\[[^\]]+\]/g, ""); // Remove citations
}

export class DustApi {
  _credentials: DustAPICredentials;
  _conversationApiUrl: string;

  /**
   * @param credentials DustAPICrededentials
   */
  constructor(credentials: DustAPICredentials) {
    this._credentials = credentials;
    this._conversationApiUrl = `${DUST_API_URL}/${credentials.workspaceId}/assistant/conversations`;
  }

  async createConversation({ question }: { question: string }): Promise<{
    conversation: ConversationType | undefined;
    message: UserMessageType | undefined;
    error: string | undefined;
  }> {
    const { apiKey } = this._credentials;
    try {
      const response = await got.post(this._conversationApiUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        json: {
          visibility: "unlisted",
          title: null,
          message: {
            content: question,
            mentions: [
              {
                configurationId: "dust",
              },
            ],
            context: {
              timezone: "Europe/Paris",
              username: "raycast",
              email: null,
              fullName: "Raycast",
              profilePictureUrl: "https://dust.tt/static/systemavatar/helper_avatar_full.png",
            },
          },
        },
        responseType: "json",
      });
      return { conversation: response.body.conversation, message: response.body.message, error: undefined };
    } catch (error: got.RequestError) {
      return { conversation: undefined, message: undefined, error: error.message };
    }
  }

  async streamAgentMessageEvents({ conversationId, messageId }: { conversationId: string; messageId: string }) {
    const { apiKey } = this._credentials;

    const res = await fetch(`${this._conversationApiUrl}/${conversationId}/messages/${messageId}/events`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!res.ok || !res.body) {
      console.error(`Error running streamed app: status_code=${res.status}  - message=${await res.text()}`);
      return null;
    }

    const pendingEvents: (
      | UserMessageErrorEvent
      | AgentErrorEvent
      | AgentActionSuccessEvent
      | GenerationTokensEvent
      | AgentGenerationSuccessEvent
    )[] = [];
    const parser = createParser((event) => {
      if (event.type === "event") {
        if (event.data) {
          try {
            const data = JSON.parse(event.data).data;
            pendingEvents.push(data);
          } catch (err) {
            console.error("Failed parsing chunk from Dust API", err);
          }
        }
      }
    });

    const reader = res.body;

    const streamEvents = async function* () {
      let done = false;
      reader.on("end", () => {
        done = true;
      });
      reader.on("readable", () => {
        let chunk;
        while (null !== (chunk = reader.read())) {
          parser.feed(new TextDecoder().decode(chunk));
        }
      });
      reader.on("error", (err) => {
        console.error("Error reading stream", err);
      });
      while (!done) {
        if (pendingEvents.length > 0) {
          yield pendingEvents.shift(); // Yields the next event
        } else {
          // Wait for the next 'readable' event or end of the stream
          await new Promise((resolve) => reader.once("readable", resolve));
        }
      }
    };

    return { eventStream: streamEvents() };
  }

  async streamAnswer({
    conversation,
    message,
    setDustAnswer,
    onDone,
  }: {
    conversation: ConversationType;
    message: UserMessageType;
    setDustAnswer: (answer: string) => void;
    onDone?: (answer: string) => void;
  }) {
    {
      const conversationId = conversation.sId;
      const agentMessages = conversation.content
        .map((versions) => {
          const m = versions[versions.length - 1];
          return m;
        })
        .filter((m) => {
          return m && m.type === "agent_message" && m.parentMessageId === message?.sId;
        });
      if (agentMessages.length === 0) {
        console.error("Failed to retrieve agent message");
      }
      const agentMessage = agentMessages[0];
      const streamRes = await this.streamAgentMessageEvents({
        conversationId,
        messageId: agentMessage.sId,
      });
      if (!streamRes) {
        return;
      }
      let answer = "";
      let lastSentDate = new Date();
      for await (const event of streamRes.eventStream) {
        if (!event) {
          continue;
        }
        switch (event.type) {
          case "user_message_error": {
            console.error(`User message error: code: ${event.error.code} message: ${event.error.message}`);
            return;
          }
          case "agent_error": {
            console.error(`Agent message error: code: ${event.error.code} message: ${event.error.message}`);
            return;
          }
          case "generation_tokens": {
            answer += event.text;
            if (lastSentDate.getTime() + 500 > new Date().getTime()) {
              continue;
            }
            lastSentDate = new Date();
            setDustAnswer(cleanupEventText(answer));
            break;
          }
          case "agent_generation_success": {
            answer = cleanupEventText(event.text);
            setDustAnswer(answer);
            if (onDone) {
              onDone(answer);
            }
            return;
          }
          default:
          // Nothing to do on unsupported events
        }
      }
    }
  }
}

export function useDustApi(): DustApi | undefined {
  const dustCredentials = useDustCredentials();
  const [dustApi, setDustApi] = useState<DustApi | undefined>(undefined);
  useEffect(() => {
    (async () => {
      if (dustCredentials) {
        const api = new DustApi(dustCredentials);
        setDustApi(api);
      }
    })();
  }, [dustCredentials]);
  return dustApi;
}
