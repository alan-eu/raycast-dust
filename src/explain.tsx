import { Detail } from "@raycast/api";
import { AskDustQuestion } from "./answer_question";
import { useEffect, useState } from "react";
import { getSelectedText, showToast, Toast } from "@raycast/api";

export default function ExplainDustCommand() {
  const [question, setQuestion] = useState<string | null>(null);

  useEffect(() => {
    async function fetchHighlightedText() {
      try {
        const text = await getSelectedText();
        setQuestion(`can you explain this: ${text} ?`);
      } catch (error) {
        showToast(Toast.Style.Failure, "Could not get highlighted text");
      }
    }

    fetchHighlightedText();
  }, []);

  return question ? <AskDustQuestion question={question} /> : <Detail markdown="No text selected" />;
}
