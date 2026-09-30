import { describe, expect, it } from 'vitest'
import { chatName, chatSourceFor } from '@/composables/useChatSettings'

describe('chatSourceFor', () => {
  it('asks for the choice as is until the VOD says which chats it has', () => {
    expect(chatSourceFor('bot', null)).toBe('bot')
    expect(chatSourceFor('auto', { replay: 0, bot: 5 })).toBe('auto')
  })

  it('falls back to the other chat only when the choice has none and the other has some', () => {
    expect(chatSourceFor('bot', { replay: 10, bot: 0 })).toBe('replay')
    expect(chatSourceFor('replay', { replay: 0, bot: 3 })).toBe('bot')
    expect(chatSourceFor('bot', { replay: 0, bot: 0 })).toBe('bot')
    expect(chatSourceFor('replay', { replay: 4, bot: 9 })).toBe('replay')
  })
})

describe('chatName', () => {
  it('shows the display name, the username, or both', () => {
    expect(chatName('Chat_Er', 'chat_er', 'display')).toEqual({ name: 'Chat_Er', login: null })
    expect(chatName('Chat_Er', 'chat_er', 'login')).toEqual({ name: 'chat_er', login: null })
    expect(chatName('チャット', 'chatter', 'both')).toEqual({ name: 'チャット', login: 'chatter' })
  })

  it('leaves the username out of "both" when unknown or only differing in case', () => {
    expect(chatName('Vexoulz', 'vexoulz', 'both')).toEqual({ name: 'Vexoulz', login: null })
    expect(chatName('チャット', null, 'both')).toEqual({ name: 'チャット', login: null })
    expect(chatName('チャット', null, 'login')).toEqual({ name: 'チャット', login: null })
  })
})
