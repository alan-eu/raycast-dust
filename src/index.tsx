import {
  Action,
  ActionPanel,
  Detail,
  Form,
  Icon,
  LaunchProps,
  LocalStorage,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import got from "got";
import { useEffect, useState } from "react";
import { createParser } from "eventsource-parser";
import fetch from "node-fetch";

const DUST_API_HOST = "https://dust.tt/api/v1/w";

function useGetConfig() {
  const [apiKey, setApiKey] = useState<string | undefined>(undefined);
  const [dustWorkspace, setDustWorkspace] = useState<string | undefined>(undefined);
  const [isLoadingKey, setIsLoadingKey] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      const key = await LocalStorage.getItem<string>("dust_api_key");
      setApiKey(key);
      const workspace = await LocalStorage.getItem<string>("dust_workspace");
      setDustWorkspace(workspace);
      setIsLoadingKey(false);
    })();
  }, []);
  return { apiKey, dustWorkspace, isLoadingKey };
}

async function streamAgentMessageEvents({
  conversationId,
  messageId,
  conversationApiUrl,
  apiKey,
}: {
  conversationId: string;
  messageId: string;
  conversationApiUrl: string;
  apiKey: string;
}) {
  const res = await fetch(`${conversationApiUrl}/${conversationId}/messages/${messageId}/events`, {
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

  const pendingEvents = [];

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

function cleanupEventText(text: string) {
  return text.replace(/:cite\[[^\]]+\]/g, ""); // Remove citations
}

export default function DustCommand(props: LaunchProps<{ arguments: { search: string } }>) {
  const question = props.arguments.search;
  const { apiKey, dustWorkspace, isLoadingKey } = useGetConfig();
  const [conversation, setConversation] = useState<any | undefined>(undefined);
  const [userMessage, setUserMessage] = useState<any | undefined>(undefined);
  const [dustAnswer, setDustAnswer] = useState<string | undefined>(undefined);
  const { push } = useNavigation();

  const dustAssistantUrl = `https://dust.tt/w/${dustWorkspace}/assistant`;
  const conversationUrl = `${DUST_API_HOST}/${dustWorkspace}/assistant/conversations`;

  useEffect(() => {
    if (apiKey && dustWorkspace) {
      (async () => {
        const response = await got.post(conversationUrl, {
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
        setConversation(response.body.conversation);
        setUserMessage(response.body.message);
      })();
    }
  }, [apiKey, dustWorkspace, question]);

  if (!apiKey && !dustWorkspace && !isLoadingKey) {
    return <SetKeyForm />;
  }

  useEffect(() => {
    if (conversation && userMessage && apiKey) {
      (async () => {
        const conversationId = conversation.sId;
        const agentMessages = conversation.content
          .map((versions) => {
            const m = versions[versions.length - 1];
            return m;
          })
          .filter((m) => {
            return m && m.type === "agent_message" && m.parentMessageId === userMessage?.sId;
          });
        if (agentMessages.length === 0) {
          console.error("Failed to retrieve agent message");
        }
        const agentMessage = agentMessages[0];
        // console.log("FOOBAR", agentMessage);
        const streamRes = await streamAgentMessageEvents({
          conversationId,
          messageId: agentMessage.sId,
          conversationApiUrl: conversationUrl,
          apiKey,
        });
        if (!streamRes) {
          return;
        }
        let answer = "";
        let lastSentDate = new Date();
        for await (const event of streamRes.eventStream) {
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
              answer += cleanupEventText(event.text);
              if (lastSentDate.getTime() + 500 > new Date().getTime()) {
                continue;
              }
              lastSentDate = new Date();
              setDustAnswer(answer);
              break;
            }
            case "agent_generation_success": {
              answer = cleanupEventText(event.text);
              setDustAnswer(answer);
              return;
            }
            default:
            // Nothing to do on unsupported events
          }
        }
      })();
    }
  }, [conversation, apiKey]);

  return (
    <Detail
      markdown={dustAnswer || "Dust is thinking..."}
      navigationTitle={question}
      isLoading={!dustAnswer}
      actions={
        <ActionPanel>
          {dustWorkspace && !conversation ? (
            <Action.OpenInBrowser title="Open Dust" url={`${dustAssistantUrl}`} icon={Icon.Globe} />
          ) : dustWorkspace && conversation ? (
            <Action.OpenInBrowser
              title="Continue on Dust"
              url={`${dustAssistantUrl}/${conversation.sId}`}
              icon={Icon.Globe}
            />
          ) : null}
          <Action
            title="Set API Key"
            icon={Icon.Lock}
            onAction={() => {
              push(<SetKeyForm />);
            }}
          />
        </ActionPanel>
      }
    />
  );
}

function SetKeyForm() {
  const { apiKey, dustWorkspace } = useGetConfig();
  return (
    <Form
      actions={
        <ActionPanel>
          <SaveAPIKey />
        </ActionPanel>
      }
    >
      <Form.TextField id="dustApiKey" title="API key" value={apiKey} placeholder="sk-XXXXX" />
      <Form.TextField id="dustWorkspace" title="Workspace ID" value={dustWorkspace} placeholder="XXXXX" />
    </Form>
  );
}
function SaveAPIKey() {
  async function handleSubmit(values: { dustApiKey: string; dustWorkspace: string }) {
    if (!values.dustApiKey || !values.dustWorkspace) {
      showToast({
        style: Toast.Style.Failure,
        title: "Please enter an API key and a workspace ID",
      });
      return;
    }
    await LocalStorage.setItem("dust_api_key", values.dustApiKey);
    await LocalStorage.setItem("dust_workspace", values.dustWorkspace);
    showToast({
      style: Toast.Style.Success,
      title: "API set",
    });
  }

  return <Action.SubmitForm icon={Icon.SaveDocument} title="Set API Key" onSubmit={handleSubmit} />;
}
