export const OPENMOJI_VERSION = '17.0.0'
export const OPENMOJI_CDN_BASE = `https://cdn.jsdelivr.net/npm/openmoji@${OPENMOJI_VERSION}/color/svg`

export type OpenMojiCategory =
  | 'Smileys & Emotion' | 'People & Body' | 'Animals & Nature' | 'Food & Drink'
  | 'Travel & Places' | 'Activities' | 'Objects' | 'Symbols' | 'Flags'

export interface OpenMojiAsset {
  id: string
  emoji: string
  name: string
  keywords: string[]
  category: OpenMojiCategory
}

export interface OpenMojiSticker extends OpenMojiAsset {
  pack: 'openmoji'
  stickerCategory: 'Reactions' | 'Funny' | 'Love' | 'Celebration' | 'Campus Life' | 'Study' | 'Food' | 'Animals' | 'Expressions'
}

const assetRows: Array<[string, string, string, string[], OpenMojiCategory]> = [
  ['1F600','😀','grinning face',['grin','happy','smile'],'Smileys & Emotion'], ['1F602','😂','face with tears of joy',['laugh','lol','funny'],'Smileys & Emotion'], ['1F60D','😍','smiling face with heart eyes',['love','crush'],'Smileys & Emotion'], ['1F622','😢','crying face',['sad','tear'],'Smileys & Emotion'], ['1F606','😆','grinning squinting face',['laugh','happy'],'Smileys & Emotion'], ['1F62E','😮','face with open mouth',['surprised','wow'],'Smileys & Emotion'], ['1F914','🤔','thinking face',['think','hmm'],'Smileys & Emotion'], ['1F60E','😎','smiling face with sunglasses',['cool'],'Smileys & Emotion'],
  ['1F44B','👋','waving hand',['hello','hi','wave'],'People & Body'], ['1F44D','👍','thumbs up',['like','yes','good'],'People & Body'], ['1F64C','🙌','raising hands',['hooray','celebrate'],'People & Body'], ['1F91D','🤝','handshake',['deal','agreement'],'People & Body'], ['1F4AA','💪','flexed biceps',['strong','workout'],'People & Body'],
  ['1F436','🐶','dog face',['dog','pet'],'Animals & Nature'], ['1F431','🐱','cat face',['cat','pet'],'Animals & Nature'], ['1F98A','🦊','fox',['fox'],'Animals & Nature'], ['1F98B','🦋','butterfly',['butterfly'],'Animals & Nature'], ['1F33F','🌿','herb',['plant','nature'],'Animals & Nature'],
  ['1F355','🍕','pizza',['pizza','food'],'Food & Drink'], ['1F354','🍔','hamburger',['burger','food'],'Food & Drink'], ['1F370','🍰','shortcake',['cake','dessert'],'Food & Drink'], ['2615','☕','hot beverage',['coffee','tea'],'Food & Drink'], ['1F9CB','🧋','bubble tea',['drink','boba'],'Food & Drink'],
  ['1F3EB','🏫','school',['campus','college'],'Travel & Places'], ['1F3D9','🏙️','cityscape',['city'],'Travel & Places'], ['1F3D6','🏖️','beach with umbrella',['beach','travel'],'Travel & Places'], ['1F680','🚀','rocket',['launch','space'],'Travel & Places'], ['1F697','🚗','automobile',['car','drive'],'Travel & Places'],
  ['26BD','⚽','soccer ball',['football','sport'],'Activities'], ['1F3C6','🏆','trophy',['winner','award'],'Activities'], ['1F3B5','🎵','musical note',['music','song'],'Activities'], ['1F3AE','🎮','video game',['gaming','game'],'Activities'], ['1F3AF','🎯','bullseye',['target','goal'],'Activities'],
  ['1F4DA','📚','books',['study','read'],'Objects'], ['1F4BB','💻','laptop',['computer','coding'],'Objects'], ['1F4A1','💡','light bulb',['idea','bright'],'Objects'], ['1F4F1','📱','mobile phone',['phone'],'Objects'], ['270F','✏️','pencil',['write','school'],'Objects'],
  ['2764','❤️','red heart',['heart','love'],'Symbols'], ['2728','✨','sparkles',['shine','magic'],'Symbols'], ['1F525','🔥','fire',['hot','lit'],'Symbols'], ['2705','✅','check mark button',['done','yes'],'Symbols'], ['1F389','🎉','party popper',['party','celebrate'],'Symbols'],
  ['1F1FA-1F1F8','🇺🇸','flag united states',['usa','flag'],'Flags'], ['1F1E8-1F1E6','🇨🇦','flag canada',['canada','flag'],'Flags'], ['1F1EC-1F1E7','🇬🇧','flag united kingdom',['uk','flag'],'Flags'], ['1F1EE-1F1F3','🇮🇳','flag india',['india','flag'],'Flags'], ['1F1EF-1F1F5','🇯🇵','flag japan',['japan','flag'],'Flags'],
]

const assets: OpenMojiAsset[] = assetRows.map(([id, emoji, name, keywords, category]) => ({ id, emoji, name, keywords, category }))

export const OPENMOJI_EMOJIS = assets

const stickerDefinitions: Array<[string, OpenMojiSticker['stickerCategory']]> = [
  ['1F44D','Reactions'], ['2764','Reactions'], ['1F525','Reactions'],
  ['1F602','Funny'], ['1F606','Funny'], ['1F60E','Funny'],
  ['1F60D','Love'], ['2764','Love'], ['1F91D','Love'],
  ['1F389','Celebration'], ['1F64C','Celebration'], ['1F3C6','Celebration'],
  ['1F3EB','Campus Life'], ['1F4BB','Campus Life'], ['1F4F1','Campus Life'],
  ['1F4DA','Study'], ['1F4A1','Study'], ['270F','Study'],
  ['1F355','Food'], ['2615','Food'], ['1F9CB','Food'],
  ['1F436','Animals'], ['1F431','Animals'], ['1F98B','Animals'],
  ['1F600','Expressions'], ['1F914','Expressions'], ['1F622','Expressions'],
]

export const OPENMOJI_STICKERS: OpenMojiSticker[] = stickerDefinitions.map(([id, stickerCategory]) => {
  const asset = assets.find((item) => item.id === id)!
  return { ...asset, pack: 'openmoji', stickerCategory }
})

export function openMojiAssetUrl(id: string) {
  return `${OPENMOJI_CDN_BASE}/${encodeURIComponent(id)}.svg`
}

export function findOpenMojiSticker(id: unknown): OpenMojiSticker | null {
  return typeof id === 'string' ? OPENMOJI_STICKERS.find((sticker) => sticker.id === id) || null : null
}

export function serializeOpenMojiSticker(stickerId: string) {
  return JSON.stringify({ stickerPack: 'openmoji', stickerId })
}

export function parseOpenMojiSticker(value?: string | null) {
  try {
    const payload = JSON.parse(value || '')
    return payload?.stickerPack === 'openmoji' && findOpenMojiSticker(payload.stickerId)
      ? { stickerPack: 'openmoji' as const, stickerId: payload.stickerId as string }
      : null
  } catch {
    return null
  }
}