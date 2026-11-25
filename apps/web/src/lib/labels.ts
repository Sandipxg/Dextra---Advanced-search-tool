import type { ContentType, Goal, Platform, Strictness, UseCase } from '@dextra/core'

/** What the user sees for each stored code (D-005: codes are stored, labels shown). */
export const GOAL_LABELS: Record<Goal, string> = {
  attack_surface: 'Attack surface',
  documents: 'Documents and files',
  exposed_pages: 'Exposed pages',
  third_party_mentions: 'Third-party mentions',
  tech_fingerprinting: 'Technology fingerprinting',
  company_research: 'Company or organisation research',
  competitor_research: 'Competitor or market research',
  news_mentions: 'News and mentions',
  general_research: 'General topic research',
}

export const USE_CASE_LABELS: Record<UseCase, string> = {
  bug_bounty: 'Bug bounty',
  authorized_pentest: 'Authorized pentest',
  own_org_audit: 'Own organisation audit',
  academic_research: 'Academic research',
  journalism: 'Journalism',
  business_research: 'Business research',
  personal: 'Personal',
}

export const TIME_LABELS = {
  any: 'Any time',
  'qdr:d': 'Past day',
  'qdr:w': 'Past week',
  'qdr:m': 'Past month',
  'qdr:y': 'Past year',
  custom: 'Custom range',
} as const

export const CONTENT_LABELS: Record<ContentType, string> = {
  web: 'Web pages',
  pdf: 'PDF',
  word: 'Word',
  spreadsheet: 'Spreadsheets',
  presentation: 'Presentations',
  text: 'Text files',
  dataset: 'Datasets (CSV/JSON)',
  image: 'Images',
  video: 'Video',
  audio: 'Audio',
}

export const DEPTH_LABELS = {
  quick: 'Quick · ~10 searches',
  standard: 'Standard · ~30 searches',
  thorough: 'Thorough · ~80 searches',
} as const

export const STRICTNESS_LABELS: Record<Strictness, string> = {
  hard: 'Hard',
  soft: 'Soft',
  open: 'Open',
}

export const STRICTNESS_HINTS: Record<Strictness, string> = {
  hard: 'Always applied; nothing outside it is returned',
  soft: 'Applied first; widened if too few results',
  open: 'Only re-ranks results',
}

export const SUBDOMAIN_LABELS = {
  include: 'Include subdomains',
  exclude: 'Main domain only',
  only: 'Subdomains only',
} as const

export const WHERE_LABELS = { anywhere: 'Anywhere', title: 'Page title', url: 'URL' } as const

export const PLATFORM_LABELS: Record<Platform, string> = {
  linkedin: 'LinkedIn',
  x: 'X',
  facebook: 'Facebook',
  instagram: 'Instagram',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  pinterest: 'Pinterest',
  reddit: 'Reddit',
  stackoverflow: 'Stack Overflow',
  quora: 'Quora',
  hacker_news: 'Hacker News',
  medium: 'Medium',
  substack: 'Substack',
  dev_to: 'DEV',
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
  public_docs: 'Notion / Trello / Google Docs',
  slideshare_scribd: 'SlideShare / Scribd',
  crunchbase: 'Crunchbase',
  glassdoor: 'Glassdoor',
  g2: 'G2',
  capterra: 'Capterra',
  trustpilot: 'Trustpilot',
  product_hunt: 'Product Hunt',
}

/** Display groups for the platform picker; a test checks every platform appears once. */
export const PLATFORM_GROUPS: ReadonlyArray<{ label: string; platforms: Platform[] }> = [
  {
    label: 'Social',
    platforms: ['linkedin', 'x', 'facebook', 'instagram', 'youtube', 'tiktok', 'pinterest'],
  },
  {
    label: 'Communities and blogs',
    platforms: ['reddit', 'stackoverflow', 'quora', 'hacker_news', 'medium', 'substack', 'dev_to'],
  },
  { label: 'Code', platforms: ['github', 'gitlab', 'bitbucket'] },
  { label: 'Docs and files', platforms: ['public_docs', 'slideshare_scribd'] },
  {
    label: 'Business and reviews',
    platforms: ['crunchbase', 'glassdoor', 'g2', 'capterra', 'trustpilot', 'product_hunt'],
  },
]

export const PREFERENCE_LABELS = {
  none: 'No preference',
  official_first: 'Official sites first',
  community_first: 'Community and forums first',
} as const

export const OUTPUT_LABELS = {
  ranked: 'Ranked list',
  grouped: 'Grouped by goal',
  csv: 'CSV',
  json: 'JSON',
} as const

export const RESULT_TYPE_LABELS = {
  web: 'Web',
  news: 'News',
  scholar: 'Scholar',
  videos: 'Videos',
  images: 'Images',
} as const

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
const languageNames = new Intl.DisplayNames(['en'], { type: 'language' })

export const countryName = (code: string) => regionNames.of(code.toUpperCase()) ?? code
export const languageName = (code: string) => languageNames.of(code) ?? code
