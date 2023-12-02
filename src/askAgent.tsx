import { Action, ActionPanel, Form, Icon, LaunchType, List, useNavigation } from "@raycast/api";
import { useAgents } from "./agents";
import AskDustCommand from "./ask";
import { AgentConfigurationType } from "./dust_api/agent";

function AskAgentQuestionForm({ agent }: { agent: AgentConfigurationType }) {
  const { push } = useNavigation();
  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Ask"
            shortcut={{ key: "return", modifiers: [] }}
            onSubmit={(values) => {
              push(
                <AskDustCommand
                  launchType={LaunchType.UserInitiated}
                  arguments={{ agent: agent, search: values.question }}
                />,
              );
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description title="Agent" text={agent.name} />
      <Form.Description text={agent.description} />
      <Form.TextArea id="question" title="Question" autoFocus />
    </Form>
  );
}

export default function AskDustAgentCommand() {
  const agents = useAgents();
  return (
    <List isLoading={!agents}>
      {agents &&
        Object.values(agents).map((agent) => (
          <List.Item
            key={agent.sId}
            title={agent.name}
            subtitle={agent.description}
            icon={agent.pictureUrl}
            accessories={[{ icon: Icon.ArrowRight }]}
            actions={
              <ActionPanel>
                <Action.Push
                  title="Ask"
                  icon={Icon.Message}
                  shortcut={{ key: "return", modifiers: [] }}
                  target={<AskAgentQuestionForm agent={agent} />}
                />
              </ActionPanel>
            }
          />
        ))}
    </List>
  );
}
