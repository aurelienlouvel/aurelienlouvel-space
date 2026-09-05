import {createElement} from 'react'
import {defineField, defineType} from 'sanity'
import {HugeiconsIcon} from '@hugeicons/react'
import type {IconSvgElement} from '@hugeicons/react'
import {
  Image02Icon,
  Video01Icon,
  MusicNote01Icon,
  WorkoutRunIcon,
  MapPinpoint01Icon,
  GithubIcon,
  FilmIcon,
  Cards02Icon,
  GameController03Icon,
  InformationCircleIcon,
} from '@hugeicons/core-free-icons'
import {IconInput} from './components/IconInput'
import {hugeIconMap} from './lib/hugeIcons'

// Fixed glyph per story type (shown in the "add item" menu + as list-row
// fallback media) — distinct from the per-entry `icon` data field below,
// which lets the editor pick any HugeIcon per entry.
function storyTypeIcon(icon: IconSvgElement) {
  return () => createElement(HugeiconsIcon, {icon, size: 16})
}

// Renders the editor-picked `icon` field (by name, via IconInput below) as
// list-row media, so the list matches what actually renders on the card.
// Falls back to undefined — which leaves the type's fixed storyTypeIcon
// glyph showing — when unset.
function pickedIconMedia(icon?: string) {
  const iconData = icon ? hugeIconMap[icon] : undefined
  return iconData ? () => createElement(HugeiconsIcon, {icon: iconData, size: 20}) : undefined
}

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
          icon: storyTypeIcon(Image02Icon),
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
          icon: storyTypeIcon(Video01Icon),
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
          icon: storyTypeIcon(MusicNote01Icon),
          preview: {
            select: {subtitle: 'url', cardTitle: 'cardTitle', icon: 'icon'},
            prepare({
              subtitle,
              cardTitle,
              icon,
            }: {
              subtitle?: string
              cardTitle?: string
              icon?: string
            }) {
              return {title: cardTitle || 'Music', subtitle, media: pickedIconMedia(icon)}
            },
          },
          fields: [
            defineField({
              name: 'cardTitle',
              title: 'Card title',
              type: 'string',
              placeholder: 'Music',
            }),
            defineField({
              name: 'icon',
              title: 'Icon',
              type: 'string',
              description: 'Leave empty to use the default icon for this card.',
              components: {input: IconInput},
            }),
            defineField({
              name: 'url',
              title: 'Apple Music playlist link',
              type: 'url',
              validation: (Rule) => Rule.required(),
            }),
          ],
        },
        {
          type: 'object',
          name: 'storyStrava',
          title: 'Activity',
          icon: storyTypeIcon(WorkoutRunIcon),
          preview: {
            select: {subtitle: 'shareUrl', cardTitle: 'cardTitle', icon: 'icon'},
            prepare({
              subtitle,
              cardTitle,
              icon,
            }: {
              subtitle?: string
              cardTitle?: string
              icon?: string
            }) {
              return {title: cardTitle || 'Activity', subtitle, media: pickedIconMedia(icon)}
            },
          },
          fields: [
            defineField({
              name: 'cardTitle',
              title: 'Card title',
              type: 'string',
              placeholder: 'Activity',
            }),
            defineField({
              name: 'icon',
              title: 'Icon',
              type: 'string',
              description: 'Leave empty to use the default icon for this card.',
              components: {input: IconInput},
            }),
            defineField({
              name: 'shareUrl',
              title: 'StatsHunters share link',
              type: 'url',
              validation: (Rule) => Rule.required(),
            }),
          ],
        },
        {
          type: 'object',
          name: 'storyAppleMaps',
          title: 'Location',
          icon: storyTypeIcon(MapPinpoint01Icon),
          preview: {
            select: {subtitle: 'address', label: 'label', cardTitle: 'cardTitle', icon: 'icon'},
            prepare({
              subtitle,
              label,
              cardTitle,
              icon,
            }: {
              subtitle?: string
              label?: string
              cardTitle?: string
              icon?: string
            }) {
              return {
                title: cardTitle || 'Location',
                subtitle: label ?? subtitle,
                media: pickedIconMedia(icon),
              }
            },
          },
          fields: [
            defineField({
              name: 'cardTitle',
              title: 'Card title',
              type: 'string',
              placeholder: 'Location',
            }),
            defineField({
              name: 'icon',
              title: 'Icon',
              type: 'string',
              description: 'Leave empty to use the default icon for this card.',
              components: {input: IconInput},
            }),
            defineField({
              name: 'address',
              title: 'Address',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'label',
              title: 'Display label (optional)',
              type: 'string',
            }),
          ],
        },
        {
          type: 'object',
          name: 'storyGithub',
          title: 'Code',
          icon: storyTypeIcon(GithubIcon),
          preview: {
            select: {subtitle: 'username', cardTitle: 'cardTitle', icon: 'icon'},
            prepare({
              subtitle,
              cardTitle,
              icon,
            }: {
              subtitle?: string
              cardTitle?: string
              icon?: string
            }) {
              return {title: cardTitle || 'Code', subtitle, media: pickedIconMedia(icon)}
            },
          },
          fields: [
            defineField({
              name: 'cardTitle',
              title: 'Card title',
              type: 'string',
              placeholder: 'Code',
            }),
            defineField({
              name: 'icon',
              title: 'Icon',
              type: 'string',
              description: 'Leave empty to use the default icon for this card.',
              components: {input: IconInput},
            }),
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
          title: 'Movies',
          icon: storyTypeIcon(FilmIcon),
          preview: {
            select: {subtitle: 'username', cardTitle: 'cardTitle', icon: 'icon'},
            prepare({
              subtitle,
              cardTitle,
              icon,
            }: {
              subtitle?: string
              cardTitle?: string
              icon?: string
            }) {
              return {title: cardTitle || 'Movies', subtitle, media: pickedIconMedia(icon)}
            },
          },
          fields: [
            defineField({
              name: 'cardTitle',
              title: 'Card title',
              type: 'string',
              placeholder: 'Movies',
            }),
            defineField({
              name: 'icon',
              title: 'Icon',
              type: 'string',
              description: 'Leave empty to use the default icon for this card.',
              components: {input: IconInput},
            }),
            defineField({
              name: 'username',
              title: 'Letterboxd username',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
          ],
        },
        {
          type: 'object',
          name: 'storyBgg',
          title: 'Board Games',
          icon: storyTypeIcon(Cards02Icon),
          preview: {
            select: {subtitle: 'username', cardTitle: 'cardTitle', icon: 'icon'},
            prepare({
              subtitle,
              cardTitle,
              icon,
            }: {
              subtitle?: string
              cardTitle?: string
              icon?: string
            }) {
              return {
                title: cardTitle || 'Board Games',
                subtitle,
                media: pickedIconMedia(icon),
              }
            },
          },
          fields: [
            defineField({
              name: 'cardTitle',
              title: 'Card title',
              type: 'string',
              // Frontend default reads "Top Board Games" (the card shows a
              // ranked top-3, not just "Board Games") — shown here so the
              // placeholder matches what actually renders when left blank.
              placeholder: 'Top Board Games',
            }),
            defineField({
              name: 'icon',
              title: 'Icon',
              type: 'string',
              description: 'Leave empty to use the default icon for this card.',
              components: {input: IconInput},
            }),
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
          title: 'Gaming',
          icon: storyTypeIcon(GameController03Icon),
          preview: {
            select: {subtitle: 'trackerUrl', cardTitle: 'cardTitle', icon: 'icon'},
            prepare({
              subtitle,
              cardTitle,
              icon,
            }: {
              subtitle?: string
              cardTitle?: string
              icon?: string
            }) {
              return {title: cardTitle || 'Gaming', subtitle, media: pickedIconMedia(icon)}
            },
          },
          fields: [
            defineField({
              name: 'cardTitle',
              title: 'Card title',
              type: 'string',
              // Frontend default reads "Valorant", not "Gaming".
              placeholder: 'Valorant',
            }),
            defineField({
              name: 'icon',
              title: 'Icon',
              type: 'string',
              description: 'Leave empty to use the default icon for this card.',
              components: {input: IconInput},
            }),
            defineField({
              name: 'trackerUrl',
              title: 'Tracker.gg profile URL',
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
          icon: storyTypeIcon(InformationCircleIcon),
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
              return {
                title: label ?? 'Fact',
                subtitle: value,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                media: (media as any) ?? pickedIconMedia(icon),
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
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'value',
              title: 'Value',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'tagline',
              title: 'Tagline (optional)',
              type: 'string',
            }),
            defineField({
              name: 'image',
              title: 'Illustration (optional)',
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
