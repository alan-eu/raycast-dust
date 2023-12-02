import { ActionPanel, Detail, showToast, Toast, useNavigation, Action, Icon } from "@raycast/api";
import { DustApi, useDustApi } from "./dust_api/api";
import { SetCredentialsForm, useDustCredentials } from "./credentials";
import { useEffect, useState } from "react";
import { addDustHistory } from "./history";

async function answerQuestion({
  question,
  dustApi,
  setDustAnswer,
  setConversationId,
}: {
  question: string;
  dustApi: DustApi;
  setDustAnswer: (answer: string) => void;
  setConversationId: (conversationId: string) => void;
}) {
  const { conversation, message, error } = await dustApi.createConversation({ question });
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
        });
      },
    });
  }
}

export function AskDustQuestion({ question }: { question: string }) {
  const dustCredentials = useDustCredentials();
  const dustApi = useDustApi();
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [dustAnswer, setDustAnswer] = useState<string | undefined>(undefined);
  const { push } = useNavigation();

  useEffect(() => {
    if (dustApi && question) {
      (async () => {
        await answerQuestion({ question, dustApi, setDustAnswer, setConversationId });
      })();
    }
  }, [dustApi, question]);

  if (!dustCredentials) {
    return <SetCredentialsForm />;
  }

  if (!question) {
    return null;
  }

  const dustAssistantUrl = `https://dust.tt/w/${dustCredentials?.workspaceId}/assistant`;

  return (
    <Detail
      markdown={dustAnswer || `Dust is thinking about your question: *${question}*`}
      navigationTitle={question || "Ask Dust"}
      isLoading={!dustAnswer}
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
          <Action
            title="Set API Key"
            icon={Icon.Lock}
            onAction={() => {
              push(<SetCredentialsForm />);
            }}
          />
        </ActionPanel>
      }
    />
  );
}
