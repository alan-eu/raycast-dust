import { ActionPanel, Detail, showToast, Toast, Action, Icon } from "@raycast/api";
import { DustApi, useDustApi } from "./dust_api/api";
import { SetCredentialsAction, SetCredentialsForm, useCheckAccess, useDustCredentials } from "./credentials";
import { useEffect, useState } from "react";
import { addDustHistory } from "./history";
import { AgentType } from "./dust_api/agent";

async function answerQuestion({
  question,
  dustApi,
  setDustAnswer,
  setConversationId,
  agent = { sId: "dust", name: "Dust" },
}: {
  question: string;
  dustApi: DustApi;
  setDustAnswer: (answer: string) => void;
  setConversationId: (conversationId: string) => void;
  agent?: AgentType;
}) {
  const { conversation, message, error } = await dustApi.createConversation({ question: question, agentId: agent.sId });
  if (error || !conversation || !message) {
    showToast({
      style: Toast.Style.Failure,
      title: error || "Dust API error",
    });
    setDustAnswer("**Dust API error**");
  } else {
    setConversationId(conversation.sId);
    await dustApi.streamAnswer({
      conversation: conversation,
      message: message,
      setDustAnswer: setDustAnswer,
      onDone: async (answer) => {
        await addDustHistory({
          conversationId: conversation.sId,
          question: question,
          answer: answer,
          date: new Date(),
          agent: agent.name,
        });
      },
    });
  }
}

export function AskDustQuestion({
  question,
  agent = { sId: "dust", name: "Dust" },
}: {
  question: string;
  agent?: AgentType;
}) {
  const { credentials: dustCredentials } = useDustCredentials();
  const { isLoading: checkAccessLoading } = useCheckAccess();
  const { api: dustApi } = useDustApi();
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [dustAnswer, setDustAnswer] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (checkAccessLoading) {
      return;
    }
    if (dustApi && question) {
      (async () => {
        await answerQuestion({
          question: question,
          dustApi: dustApi,
          agent: agent,
          setDustAnswer: setDustAnswer,
          setConversationId: setConversationId,
        });
      })();
    }
  }, [dustApi, question, checkAccessLoading]);

  if (!question) {
    return null;
  }

  const dustAssistantUrl = `https://dust.tt/w/${dustCredentials?.workspaceId}/assistant`;

  return (
    <Detail
      markdown={dustAnswer || `Dust agent \`${agent.name}\` is thinking about your question:\n\n > ${question}`}
      navigationTitle={question || "Ask Dust"}
      isLoading={checkAccessLoading || !dustAnswer}
      actions={
        <ActionPanel>
          {dustCredentials && !conversationId ? (
            <Action.OpenInBrowser title="Open Dust" url={`${dustAssistantUrl}/new`} icon={Icon.Globe} />
          ) : dustApi && conversationId ? (
            <Action.OpenInBrowser
              title="Continue on Dust"
              url={`${dustAssistantUrl}/${conversationId}`}
              icon={Icon.Globe}
            />
          ) : null}
          <SetCredentialsAction />
        </ActionPanel>
      }
    />
  );
}
