import { useSessionMutation } from "@/lib/query/createSessionMutation";
import {
  addCourt,
  removeCourt,
  renameCourt,
  type RemoveCourtInput,
  type RenameCourtInput,
} from "@/lib/mutations/courts";

export const useAddCourt = () => useSessionMutation<void>(addCourt);
export const useRemoveCourt = () => useSessionMutation<RemoveCourtInput>(removeCourt);
export const useRenameCourt = () => useSessionMutation<RenameCourtInput>(renameCourt);
