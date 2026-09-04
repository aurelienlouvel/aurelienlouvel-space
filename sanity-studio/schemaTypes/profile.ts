import {createElement} from 'react'
import {defineField, defineType} from 'sanity'
import {HugeiconsIcon} from '@hugeicons/react'
import {IconInput} from './components/IconInput'
import {hugeIconMap} from './lib/hugeIcons'

export const profileType = defineType({
  name: 'profile',
  title: 'Profile',
  type: 'document',
  preview: {
    select: {firstName: 'firstName', lastName: 'lastName', media: 'stories.0.image'},
    prepare({firstName, lastName, media}: {firstName?: string; lastName?: string; media?: unknown}) {
      return {
        title: [firstName, lastName].filter(Boolean).join(' ') || 'Profile',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        media: media as any,
      }
    },
  },
  fields: [
    defineField({
      name: 'firstName',
      title: 'First Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'lastName',
      title: 'Last Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'pseudo',
      title: 'Pseudo',
      type: 'string',
    }),
    defineField({
      name: 'jobTitle',
      title: 'Job title',
      type: 'string',
    }),
    defineField({
      name: 'bio',
      title: 'Bio',
      type: 'text',
      rows: 4,
    }),
    defineField({
      name: 'stories',
      title: 'Stories',
      type: 'array',
      of: [
        {
          type: 'object',
          name: 'storyPhoto',
          title: 'Photo',
          preview: {
            select: {media: 'image', title: 'caption'},
            prepare({media, title}: {media?: unknown; title?: string}) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              return {title: title ?? 'Photo', media: media as any}
            },
          },
          fields: [
            defineField({
              name: 'image',
              title: 'Image',
              type: 'image',
              options: {hotspot: true},
            }),
            defineField({name: 'alt', title: 'Alt text', type: 'string'}),
            defineField({name: 'caption', title: 'Caption', type: 'string'}),
          ],
        },
        {
          type: 'object',
          name: 'storyVideo',
          title: 'Video',
          preview: {
            select: {caption: 'caption'},
            prepare({caption}: {caption?: string}) {
              return {title: caption ?? 'Video'}
            },
          },
          fields: [
            defineField({
              name: 'file',
              title: 'Video file',
              type: 'file',
              options: {accept: 'video/*'},
            }),
            defineField({
              name: 'url',
              title: 'External URL',
              type: 'url',
            }),
            defineField({name: 'caption', title: 'Caption', type: 'string'}),
          ],
        },
        {
          type: 'object',
          name: 'storyAppleMusic',
          title: 'Music',
          preview: {
            select: {subtitle: 'url'},
            prepare({subtitle}: {subtitle?: string}) {
              return {title: 'Music', subtitle}
            },
          },
          fields: [
            defineField({
              name: 'url',
              title: 'Apple Music playlist link',
              description:
                'Full playlist URL (e.g. https://music.apple.com/fr/playlist/name/pl.xxxxx) — 3 random tracks are picked from it and rotated across story loops',
              type: 'url',
              validation: (Rule) => Rule.required(),
            }),
          ],
        },
        {
          type: 'object',
          name: 'storyStrava',
          title: 'Strava',
          preview: {
            select: {subtitle: 'shareUrl'},
            prepare({subtitle}: {subtitle?: string}) {
              return {title: 'Strava', subtitle}
            },
          },
          fields: [
            defineField({
              name: 'shareUrl',
              title: 'StatsHunters share link',
              description: 'Paste your full StatsHunters share URL (e.g. https://www.statshunters.com/share/b97a7df6d0f9)',
              type: 'url',
              validation: (Rule) => Rule.required(),
            }),
          ],
        },
        {
          type: 'object',
          name: 'storyAppleMaps',
          title: 'Location',
          preview: {
            select: {subtitle: 'address', label: 'label'},
            prepare({subtitle, label}: {subtitle?: string; label?: string}) {
              return {title: 'Location', subtitle: label ?? subtitle}
            },
          },
          fields: [
            defineField({
              name: 'address',
              title: 'Address',
              description: 'Street address or city name (e.g. "9 rue Courat, 75020 Paris")',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'label',
              title: 'Display label (optional)',
              description: 'Override the label shown on the card (default: "City, Country")',
              type: 'string',
            }),
          ],
        },
        {
          type: 'object',
          name: 'storyGithub',
          title: 'GitHub',
          preview: {
            select: {subtitle: 'username'},
            prepare({subtitle}: {subtitle?: string}) {
              return {title: 'GitHub', subtitle}
            },
          },
          fields: [
            defineField({
              name: 'username',
              title: 'GitHub username',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
          ],
        },
        {
          type: 'object',
          name: 'storyLetterboxd',
          title: 'Letterboxd',
          preview: {
            select: {subtitle: 'username'},
            prepare({subtitle}: {subtitle?: string}) {
              return {title: 'Letterboxd', subtitle}
            },
          },
          fields: [
            defineField({
              name: 'username',
              title: 'Letterboxd username',
              description: 'Sans @ — ex: "aurelien"',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
          ],
        },
        {
          type: 'object',
          name: 'storyBgg',
          title: 'BoardGameGeek',
          preview: {
            select: {subtitle: 'username'},
            prepare({subtitle}: {subtitle?: string}) {
              return {title: 'BoardGameGeek', subtitle}
            },
          },
          fields: [
            defineField({
              name: 'username',
              title: 'BoardGameGeek username',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
          ],
        },
        {
          type: 'object',
          name: 'storyValorant',
          title: 'Valorant',
          preview: {
            select: {subtitle: 'trackerUrl'},
            prepare({subtitle}: {subtitle?: string}) {
              return {title: 'Valorant', subtitle}
            },
          },
          fields: [
            defineField({
              name: 'trackerUrl',
              title: 'Tracker.gg profile URL',
              description: 'e.g. https://tracker.gg/valorant/profile/riot/oré%23369/overview',
              type: 'url',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'region',
              title: 'Region',
              type: 'string',
              options: {
                list: [
                  {title: 'Europe', value: 'eu'},
                  {title: 'North America', value: 'na'},
                  {title: 'Asia Pacific', value: 'ap'},
                  {title: 'Korea', value: 'kr'},
                ],
                layout: 'radio',
              },
              initialValue: 'eu',
            }),
          ],
        },
        {
          type: 'object',
          name: 'storyFact',
          title: 'Fact',
          description: 'A small personal trivia card, e.g. "Morning drink → Café latte"',
          preview: {
            select: {label: 'label', value: 'value', icon: 'icon', media: 'image'},
            prepare({
              label,
              value,
              icon,
              media,
            }: {
              label?: string
              value?: string
              icon?: string
              media?: unknown
            }) {
              const iconData = icon ? hugeIconMap[icon] : undefined
              const IconComp = iconData
                ? () => createElement(HugeiconsIcon, {icon: iconData, size: 20})
                : undefined
              return {
                title: label ?? 'Fact',
                subtitle: value,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                media: (media as any) ?? IconComp,
              }
            },
          },
          fields: [
            defineField({
              name: 'icon',
              title: 'Icon',
              type: 'string',
              components: {input: IconInput},
            }),
            defineField({
              name: 'label',
              title: 'Label',
              description: 'e.g. "Morning drink"',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'value',
              title: 'Value',
              description: 'e.g. "Café latte"',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'tagline',
              title: 'Tagline (optional)',
              description:
                'Short sentence shown under a large value, type-specimen style — e.g. for a font: "A grotesque sans-serif with a Swiss soul"',
              type: 'string',
            }),
            defineField({
              name: 'image',
              title: 'Illustration (optional)',
              description: 'Shown full-bleed on the card instead of the icon/value layout — e.g. a photo for the morning drink',
              type: 'image',
              options: {hotspot: true},
            }),
          ],
        },
      ],
    }),
    defineField({
      name: 'tools',
      title: 'Favorite tools',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'tool'}]}],
    }),
  ],
})
