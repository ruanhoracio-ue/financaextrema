/* Tipos frouxos para a biblioteca .jsx do design system.
   O contrato de props real está documentado em cada componente e no catalog.js;
   aqui só evitamos que o strict mode invente contratos errados a partir do JS. */
import type * as React from 'react'

type C = React.ComponentType<Record<string, unknown>>

export const Container: C
export const Section: C
export const Eyebrow: C
export const SectionHeader: C
export const Stars: C
export const Display: C
export const Heading: C
export const Text: C
export const Code: C
export const Kbd: C
export const Link: C
export const Button: C
export const ButtonIconBadge: C
export const Badge: C
export const Breadcrumbs: C
export const Card: C
export const FeatureIconCard: C
export const MediaCard: C
export const MetricCard: C
export const Field: C
export const Input: C
export const Select: C
export const DateInput: C
export const DateRangeField: C
export const SegmentedControl: C
export const TestimonialCard: C
export const VideoTestimonialCard: C
export const PricingCard: C
export const Faq: C
export const Stats: C
export const Table: C
export const SidebarNav: C
export const Navbar: C
export const Footer: C
export const Logo: C
export const ThemeToggle: C
export const FadeIn: C
export const HoverHeadline: C
export const MembersPortalMockup: C
export const SolutionShowcase: C
export const Marquee: C
export const DotGrid: C
export const VideoLightbox: C
export const VideoModal: C
export function useTheme(): { theme: string; toggle: () => void; setTheme: (t: string) => void }
export function useSpotlight(): Record<string, unknown>
