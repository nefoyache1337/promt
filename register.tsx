import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const items = atom({ plugin: 'next-prompts', key: 'items' } as const, [] as string[])

const ASK =
  'Предложи ровно 3 коротких варианта следующего сообщения от пользователя: ' +
  'что он логично мог бы написать дальше (уточнение, следующий шаг, проверка результата). ' +
  'Пиши от лица пользователя, на том же языке, на котором он общается, по одному варианту в строке, ' +
  'не длиннее 120 символов, без нумерации, кавычек и пояснений. Только 3 строки.'

function parse(text: string): string[] {
  return text
    .split('\n')
    .map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/^["«“]|["»”]$/g, '').trim())
    .filter(l => l.length > 0 && l.length <= 160)
    .slice(0, 3)
}

export const register: Register = on => {
  let isBusy = false

  on('prompt.submit', async ($, e, next) => {
    try {
      await update($, items, () => [])
    } catch {
      // the suggestions just stay until the next answer
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined || isBusy) return result
    isBusy = true
    try {
      const r = await $.model.fork({ prompt: ASK })
      if (r.isAnswered) {
        const list = parse(r.text)
        if (list.length > 0) await update($, items, () => list)
      }
    } finally {
      isBusy = false
    }
    return result
  })

  on('prompt.edit', async ($, e, next) => {
    const n = e.text === '' && e.inputText.length === 1 ? Number(e.inputText) : 0
    if (n >= 1 && n <= 3) {
      const list = await read($, items)
      const pick = list[n - 1]
      if (pick !== undefined) {
        await update($, items, () => [])
        return { text: pick, cursor: pick.length }
      }
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, items)
    if (e.props.hasSurvey || list.length === 0) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Text dimColor>Следующий шаг: нажмите 1, 2 или 3 в пустой строке ввода</Text>
        {list.map((text, i) => (
          <Button
            key={`p${i}`}
            label={`${i + 1}. ${text}`}
            onPress={async () => {
              await update($, items, () => [])
              await $.prompt.fill({ text })
            }}
          />
        ))}
      </Box>
    )
  })
}
