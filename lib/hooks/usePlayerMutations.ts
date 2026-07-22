import { useSessionMutation } from "@/lib/query/createSessionMutation";
import {
  addPlayers,
  editPlayer,
  linkPlayers,
  removePlayer,
  unlinkPlayers,
  type AddPlayersInput,
  type EditPlayerInput,
  type LinkPlayersInput,
  type RemovePlayerInput,
  type UnlinkPlayersInput,
} from "@/lib/mutations/players";

export const useAddPlayers = () => useSessionMutation<AddPlayersInput>(addPlayers);
export const useEditPlayer = () => useSessionMutation<EditPlayerInput>(editPlayer);
export const useRemovePlayer = () => useSessionMutation<RemovePlayerInput>(removePlayer);
export const useLinkPlayers = () => useSessionMutation<LinkPlayersInput>(linkPlayers);
export const useUnlinkPlayers = () => useSessionMutation<UnlinkPlayersInput>(unlinkPlayers);
