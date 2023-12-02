import { AgentConfigurationType } from "./dust_api/agent";
import { useDustApi } from "./dust_api/api";
import { useEffect, useState } from "react";
import { LocalStorage } from "@raycast/api";

async function saveAgents(agents: { [id: string]: AgentConfigurationType }) {
  await LocalStorage.setItem("dust_agents", JSON.stringify(agents));
}

async function getSavedAgents(): Promise<{ [id: string]: AgentConfigurationType } | undefined> {
  const agents = await LocalStorage.getItem<string>("dust_agents");
  if (!agents) {
    return undefined;
  }
  return JSON.parse(agents) as { [id: string]: AgentConfigurationType };
}

export function useAgents(): {
  agents: { [id: string]: AgentConfigurationType } | undefined;
  error?: string;
  isLoading: boolean;
} {
  const { api: dustApi } = useDustApi();
  const [agents, setAgents] = useState<{ [id: string]: AgentConfigurationType } | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    (async () => {
      if (dustApi) {
        const { agents, error } = await dustApi.getAgents();
        setError(error);
        if (agents) {
          const agentsMap: { [id: string]: AgentConfigurationType } = {};
          agents.forEach((agent) => {
            if (agent.status === "active") {
              agentsMap[agent.sId] = agent;
            }
          });
          setAgents(agentsMap);
          await saveAgents(agentsMap);
          setIsLoading(false);
        }
      }
    })();
  }, [dustApi]);

  useEffect(() => {
    (async () => {
      const saved_agents = await getSavedAgents();
      if (saved_agents) {
        setAgents(saved_agents);
        setIsLoading(false);
      }
    })();
  }, []);
  return { agents: agents, error: error, isLoading: isLoading };
}
