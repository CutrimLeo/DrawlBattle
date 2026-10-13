import { AVATARS } from '../../../shared/types';
export const avatarNames: Record<string, string> = { fox: 'Raposa', cat: 'Gato', bear: 'Urso', rabbit: 'Coelho', panda: 'Panda', dog: 'Cachorro', frog: 'Sapo', owl: 'Coruja' };
const faces: Record<string, string> = { fox: '🦊', cat: '🐱', bear: '🐻', rabbit: '🐰', panda: '🐼', dog: '🐶', frog: '🐸', owl: '🦉' };
export function Avatar({ avatar, small = false }: { avatar: string; small?: boolean }) {
  return <span className={'avatar avatar-' + avatar + (small ? ' avatar-small' : '')} aria-label={avatarNames[avatar] || 'Avatar'}>{faces[avatar] || '🎨'}</span>;
}
export function AvatarPicker({ value, onChange }: { value: string; onChange: (avatar: string) => void }) {
  return <div className="avatar-picker" role="group" aria-label="Escolha seu avatar">{AVATARS.map((avatar) => <button key={avatar} type="button" className={'avatar-choice ' + (avatar === value ? 'selected' : '')} aria-label={'Escolher ' + avatarNames[avatar]} aria-pressed={avatar === value} onClick={() => onChange(avatar)}><Avatar avatar={avatar} /></button>)}</div>;
}
