/** 群页 UI 层状态（E8）：Sheet / Toast / 搜索 等叠层 */
import { useReducer } from 'react';
import type { ComposerActionMode } from '@/components/group/GroupComposerBar';
import type { GroupSettingsPane } from '@/components/group/GroupSettingsSheet';

export type GroupPageUiState = {
  settingsOpen: boolean;
  settingsPane: GroupSettingsPane;
  cardOpen: boolean;
  wallOpen: boolean;
  inviteOpen: boolean;
  composerMode: ComposerActionMode | null;
  searchOpen: boolean;
  toast: string | null;
};

type Action =
  | { type: 'open_settings'; pane?: GroupSettingsPane }
  | { type: 'close_settings' }
  | { type: 'set_settings_pane'; pane: GroupSettingsPane }
  | { type: 'set_card_open'; open: boolean }
  | { type: 'set_wall_open'; open: boolean }
  | { type: 'set_invite_open'; open: boolean }
  | { type: 'set_composer_mode'; mode: ComposerActionMode | null }
  | { type: 'set_search_open'; open: boolean }
  | { type: 'show_toast'; msg: string }
  | { type: 'clear_toast' };

const initial: GroupPageUiState = {
  settingsOpen: false,
  settingsPane: 'home',
  cardOpen: false,
  wallOpen: false,
  inviteOpen: false,
  composerMode: null,
  searchOpen: false,
  toast: null,
};

function reducer(state: GroupPageUiState, action: Action): GroupPageUiState {
  switch (action.type) {
    case 'open_settings':
      return {
        ...state,
        settingsOpen: true,
        settingsPane: action.pane ?? 'home',
      };
    case 'close_settings':
      return { ...state, settingsOpen: false };
    case 'set_settings_pane':
      return { ...state, settingsPane: action.pane };
    case 'set_card_open':
      return { ...state, cardOpen: action.open };
    case 'set_wall_open':
      return { ...state, wallOpen: action.open };
    case 'set_invite_open':
      return { ...state, inviteOpen: action.open };
    case 'set_composer_mode':
      return { ...state, composerMode: action.mode };
    case 'set_search_open':
      return { ...state, searchOpen: action.open };
    case 'show_toast':
      return { ...state, toast: action.msg };
    case 'clear_toast':
      return { ...state, toast: null };
    default:
      return state;
  }
}

export function useGroupPageUiState() {
  return useReducer(reducer, initial);
}
