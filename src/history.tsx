import { Action, ActionPanel, Detail, Icon, List, LocalStorage } from "@raycast/api";
import { useEffect, useState } from "react";
import { showToast, Toast } from "@raycast/api";
import { format } from "date-fns";
import { DustAPICredentials } from "./dust_api/api";
import { useGetConfig } from "./credentials";

export interface DustHistory {
  conversationId: string;
  question: string;
  answer: string;
  date: Date;
}

export async function getDustHistory(): Promise<DustHistory[]> {
  const history = await LocalStorage.getItem<string>("dust_history");
  if (!history) {
    return [];
  }
  const parsed_history = JSON.parse(history) as DustHistory[];
  return parsed_history.map((h) => {
    return { ...h, date: new Date(h.date) };
  });
}

export async function addDustHistory(history: DustHistory) {
  const historyList = await getDustHistory();
  historyList.push(history);
  await LocalStorage.setItem("dust_history", JSON.stringify(historyList));
}

export default function DustHistoryCommand() {
  const [history, setHistory] = useState<DustHistory[] | null>(null);
  const [dustCredentials, setDustCredentials] = useState<DustAPICredentials | undefined>(undefined);
  useEffect(() => {
    (async () => {
      const credentials = await useGetConfig();
      setDustCredentials(credentials);
    })();
  }, []);

  useEffect(() => {
    async function history() {
      try {
        const history = await getDustHistory();
        setHistory(history);
      } catch (error) {
        await showToast(Toast.Style.Failure, "Could not get history");
      }
    }
    history();
  }, []);

  const dustAssistantUrl = `https://dust.tt/w/${dustCredentials?.workspaceId}/assistant`;

  return (
    <List isLoading={history === null} isShowingDetail>
      {history && history.length > 0 ? (
        history
          .sort((a, b) => b.date.getTime() - a.date.getTime())
          .map((item) => (
            <List.Item
              key={item.question}
              title={item.question}
              subtitle={format(item.date, "MM-dd HH:mm")}
              detail={
                <List.Item.Detail
                  markdown={`### ${format(item.date, "yyyy-MM-dd HH:mm")}\n\n ### ${(item.question.length > 50
                    ? item.question.slice(0, 50) + "..."
                    : item.question
                  ).replaceAll("\n", " ")} \n\n ${item.answer}`}
                />
              }
              actions={
                <ActionPanel>
                  <Action.OpenInBrowser
                    title="Continue on Dust"
                    url={`${dustAssistantUrl}/${item.conversationId}`}
                    icon={Icon.Globe}
                  />
                  <Action
                    title={"Remove"}
                    icon={Icon.DeleteDocument}
                    onAction={async () => {
                      const newHistory = history.filter((h) => h.conversationId !== item.conversationId);
                      await LocalStorage.setItem("dust_history", JSON.stringify(newHistory));
                      setHistory(newHistory);
                    }}
                  />
                  <Action
                    icon={Icon.Trash}
                    title="Clear All History"
                    onAction={async () => {
                      await LocalStorage.setItem("dust_history", JSON.stringify([]));
                      setHistory([]);
                    }}
                  />
                </ActionPanel>
              }
            />
          ))
      ) : (
        <List.EmptyView icon={Icon.BulletPoints} title="No Dust history yet" />
      )}
    </List>
  );
}
