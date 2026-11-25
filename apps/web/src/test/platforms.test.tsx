import { type Platform, PlatformSchema } from '@dextra/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { PlatformPicker } from '../features/intake/PlatformPicker'
import { CONTENT_LABELS, PLATFORM_GROUPS } from '../lib/labels'

const Harness = ({ initial = [] as Platform[] }) => {
  const [value, setValue] = useState<Platform[]>(initial)
  return (
    <>
      <PlatformPicker value={value} onChange={setValue} />
      <output data-testid="value">{value.join(',')}</output>
    </>
  )
}

const picked = () => {
  const text = screen.getByTestId('value').textContent ?? ''
  return text ? text.split(',') : []
}

describe('PLATFORM_GROUPS', () => {
  it('lists every platform exactly once', () => {
    const listed = PLATFORM_GROUPS.flatMap((g) => g.platforms)
    expect([...listed].sort()).toEqual([...PlatformSchema.options].sort())
    expect(new Set(listed).size).toBe(listed.length)
  })
})

describe('PlatformPicker (D-027)', () => {
  it('selects and clears every platform with "Select all"', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const all = screen.getByRole('checkbox', { name: /Select all \(25\)/ })
    expect(all).not.toBeChecked()

    await user.click(all)
    expect(all).toBeChecked()
    expect(picked()).toHaveLength(PlatformSchema.options.length)

    await user.click(all)
    expect(all).not.toBeChecked()
    expect(picked()).toEqual([])
  })

  it('shows a partly selected state and keeps other groups when a chip changes', async () => {
    const user = userEvent.setup()
    render(<Harness initial={['github']} />)
    const all = screen.getByRole('checkbox', { name: /Select all/ }) as HTMLInputElement
    expect(all.indeterminate).toBe(true)

    await user.click(screen.getByRole('button', { name: 'YouTube' }))
    expect(picked().sort()).toEqual(['github', 'youtube'])

    await user.click(all)
    expect(all.indeterminate).toBe(false)
    expect(picked()).toHaveLength(PlatformSchema.options.length)
  })
})

describe('content types', () => {
  it('offers images, video and audio', () => {
    expect(CONTENT_LABELS.image).toBe('Images')
    expect(CONTENT_LABELS.video).toBe('Video')
    expect(CONTENT_LABELS.audio).toBe('Audio')
  })
})
