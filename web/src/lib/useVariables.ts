import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export function useVariables() {
  return useQuery({
    queryKey: ["variables"],
    queryFn: async () => (await api.variables()).variables,
    staleTime: Infinity,
  });
}
