import { Detail, getSelectedText, showToast, Toast } from "@raycast/api";
import { AskDustQuestion } from "./answerQuestion";
import { useEffect, useState } from "react";

export default function ExplainDustCommand() {
  const [question, setQuestion] = useState<string | null>(null);

  useEffect(() => {
    async function fetchHighlightedText() {
      try {
        const text = await getSelectedText();
        setQuestion(`explain this: ${text} ?`);
      } catch (error) {
        showToast(Toast.Style.Failure, "Could not get highlighted text");
      }
    }

    fetchHighlightedText();
  }, []);

  return question ? <AskDustQuestion question={question} /> : <Detail markdown="No text selected" />;
}
