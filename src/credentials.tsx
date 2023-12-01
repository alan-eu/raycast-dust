import { useEffect, useState } from "react";
import { DustAPICredentials } from "./dust/api";
import { Action, ActionPanel, Form, Icon, LocalStorage, popToRoot, showToast, Toast } from "@raycast/api";

export function SetCredentialsForm() {
  const [credentials, setCredentials] = useState<DustAPICredentials | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const key = await LocalStorage.getItem<string>("dust_api_key");
      const workspace = await LocalStorage.getItem<string>("dust_workspace");
      if (key && workspace) {
        setCredentials({ apiKey: key, workspaceId: workspace });
      }
    })();
  }, []);

  return (
    <Form
      actions={
        <ActionPanel>
          <SaveAPIKey />
        </ActionPanel>
      }
    >
      <Form.TextField id="dustApiKey" title="API key" value={credentials?.apiKey} placeholder="sk-XXXXX" />
      <Form.TextField id="dustWorkspace" title="Workspace ID" value={credentials?.workspaceId} placeholder="XXXXX" />
    </Form>
  );
}

export async function useGetConfig(): Promise<DustAPICredentials | undefined> {
  const key = await LocalStorage.getItem<string>("dust_api_key");
  const workspace = await LocalStorage.getItem<string>("dust_workspace");
  if (!key || !workspace) {
    return undefined;
  }
  return { apiKey: key, workspaceId: workspace };
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
    await popToRoot();
  }

  return (
    <Action.SubmitForm
      icon={Icon.SaveDocument}
      title="Set API Key"
      onSubmit={handleSubmit}
      shortcut={{ key: "return", modifiers: [] }}
    />
  );
}
