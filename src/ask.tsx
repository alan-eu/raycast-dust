import { LaunchProps } from "@raycast/api";
import { AskDustQuestion } from "./answer_question";

export default function AskDustCommand(props: LaunchProps<{ arguments: { search: string } }>) {
  const question = props.arguments.search;

  return <AskDustQuestion question={question} />;
}
