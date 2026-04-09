/**
 * Curated list of publicly accessible police department dispatch log feeds
 * that are compatible with the CampusSafe HTML-table scraper format.
 *
 * Verification status:
 *   verified   — Confirmed working. Used in production by at least one CampusSafe deployment.
 *   unverified — URL is publicly documented but not yet confirmed compatible with the scraper.
 *
 * To add a new entry: confirm the URL returns an HTML table of dispatch calls,
 * set status to "verified", and submit a pull request.
 */

export interface DispatchFeed {
  id: string
  label: string           // Short display name for the dropdown
  university: string      // Associated university or campus
  city: string
  state: string
  url: string
  status: 'verified' | 'unverified'
  notes?: string
}

export const KNOWN_DISPATCH_FEEDS: DispatchFeed[] = [
  {
    id: 'epd-eugene-or',
    label: 'Eugene Police Department',
    university: 'University of Oregon',
    city: 'Eugene',
    state: 'OR',
    url: 'https://coeapps.eugene-or.gov/epddispatchlog',
    status: 'verified',
    notes: 'Official City of Eugene CAD dispatch log. HTML table format. ~2hr data delay.',
  },
  {
    id: 'cpd-corvallis-or',
    label: 'Corvallis Police Department',
    university: 'Oregon State University',
    city: 'Corvallis',
    state: 'OR',
    url: '',
    status: 'unverified',
    notes: 'Corvallis PD public dispatch availability not yet confirmed. Check cpr.corvallisoregon.gov.',
  },
  {
    id: 'papd-palo-alto-ca',
    label: 'Palo Alto Police Department',
    university: 'Stanford University',
    city: 'Palo Alto',
    state: 'CA',
    url: '',
    status: 'unverified',
    notes: 'Palo Alto PD dispatch log availability not yet confirmed. Check cityofpaloalto.org.',
  },
  {
    id: 'ucpd-berkeley-ca',
    label: 'Berkeley Police Department',
    university: 'UC Berkeley',
    city: 'Berkeley',
    state: 'CA',
    url: '',
    status: 'unverified',
    notes: 'Berkeley PD dispatch log availability not yet confirmed. Check cityofberkeley.info.',
  },
  {
    id: 'spd-seattle-wa',
    label: 'Seattle Police Department',
    university: 'University of Washington',
    city: 'Seattle',
    state: 'WA',
    url: '',
    status: 'unverified',
    notes: 'SPD publishes some open data via data.seattle.gov — format may differ from HTML table scraper.',
  },
]

export const VERIFIED_FEEDS = KNOWN_DISPATCH_FEEDS.filter((f) => f.status === 'verified' && f.url)
export const ALL_FEEDS_WITH_URL = KNOWN_DISPATCH_FEEDS.filter((f) => f.url)
