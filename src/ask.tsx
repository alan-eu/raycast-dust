import { LaunchProps } from "@raycast/api";
import { AskDustQuestion } from "./answerQuestion";
import { AgentType } from "./dust_api/agent";

export default function AskDustCommand(props: LaunchProps<{ arguments: { search: string; agent?: AgentType } }>) {
  const question = props.arguments.search;
  const agent = props.arguments.agent;

  return <AskDustQuestion question={question} agent={agent} />;
}
