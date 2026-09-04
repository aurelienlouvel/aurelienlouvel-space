import {defineArrayMember, defineField, defineType} from 'sanity'
import {ColorInput} from './components/ColorInput'
import {IconInput} from './components/IconInput'

// ── 1. blockText ──────────────────────────────────────────────────────────────

export const blockText = defineType({
  name: 'blockText',
  title: 'Text',
  type: 'object',
  preview: {
    prepare() {
      return {title: 'Text'}
    },
  },
  fields: [
    defineField({
      name: 'body',
      title: 'Body',
      type: 'array',
      validation: (Rule) => Rule.required(),
      of: [
        defineArrayMember({
          type: 'block',
          styles: [
            {title: 'Normal', value: 'normal'},
            {title: 'H2', value: 'h2'},
            {title: 'H3', value: 'h3'},
            {title: 'H4', value: 'h4'},
          ],
          lists: [
            {title: 'Bullet', value: 'bullet'},
            {title: 'Number', value: 'number'},
          ],
          marks: {
            decorators: [
              {title: 'Strong', value: 'strong'},
              {title: 'Emphasis', value: 'em'},
              {title: 'Code', value: 'code'},
            ],
            annotations: [
              defineArrayMember({
                name: 'link',
                type: 'object',
                title: 'Link',
                fields: [
                  defineField({name: 'href', title: 'URL', type: 'url'}),
                  defineField({
                    name: 'blank',
                    title: 'Open in new tab',
                    type: 'boolean',
                    initialValue: true,
                  }),
                ],
              }),
            ],
          },
        }),
      ],
    }),
  ],
})

// ── 2. blockMedia ─────────────────────────────────────────────────────────────

export const blockMedia = defineType({
  name: 'blockMedia',
  title: 'Media',
  type: 'object',
  preview: {
    select: {items: 'items'},
    prepare({items}: {items?: unknown[]}) {
      const count = Array.isArray(items) ? items.length : 0
      return {title: 'Media', subtitle: `${count} item${count !== 1 ? 's' : ''}`}
    },
  },
  fields: [
    defineField({
      name: 'items',
      title: 'Items',
      type: 'array',
      validation: (Rule) => Rule.required().min(1),
      of: [
        defineArrayMember({
          type: 'object',
          name: 'mediaItem',
          title: 'Media item',
          preview: {
            select: {mediaType: 'mediaType', image: 'image', caption: 'caption'},
            prepare({
              mediaType,
              image,
              caption,
            }: {
              mediaType?: string
              image?: unknown
              caption?: string
            }) {
              return {
                title: mediaType === 'video' ? 'Video' : mediaType === 'embed' ? 'Embed' : 'Image',
                subtitle: caption,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                media: mediaType !== 'video' && mediaType !== 'embed' ? (image as any) : undefined,
              }
            },
          },
          fields: [
            defineField({
              name: 'mediaType',
              title: 'Type',
              type: 'string',
              options: {
                list: [
                  {title: 'Image', value: 'image'},
                  {title: 'Video', value: 'video'},
                  {title: 'Embed', value: 'embed'},
                ],
                layout: 'radio',
              },
              initialValue: 'image',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'image',
              title: 'Image',
              type: 'image',
              options: {hotspot: true},
              fields: [defineField({name: 'alt', title: 'Alt text', type: 'string'})],
              hidden: ({parent}) => (parent as {mediaType?: string})?.mediaType !== 'image',
            }),
            defineField({
              name: 'videoFile',
              title: 'Video file',
              type: 'file',
              options: {accept: 'video/*'},
              hidden: ({parent}) => (parent as {mediaType?: string})?.mediaType !== 'video',
            }),
            defineField({
              name: 'videoUrl',
              title: 'External URL',
              type: 'url',
              hidden: ({parent}) => (parent as {mediaType?: string})?.mediaType !== 'video',
            }),
            defineField({
              name: 'embedProvider',
              title: 'Provider',
              type: 'string',
              options: {
                list: [
                  {title: 'Figma', value: 'figma'},
                  {title: 'YouTube', value: 'youtube'},
                  {title: 'Vimeo', value: 'vimeo'},
                  {title: 'Lottie', value: 'lottie'},
                  {title: 'CodeSandbox', value: 'codesandbox'},
                  {title: 'Other', value: 'other'},
                ],
                layout: 'radio',
              },
              hidden: ({parent}) => (parent as {mediaType?: string})?.mediaType !== 'embed',
            }),
            defineField({
              name: 'embedUrl',
              title: 'URL',
              type: 'url',
              hidden: ({parent}) => (parent as {mediaType?: string})?.mediaType !== 'embed',
            }),
            defineField({name: 'caption', title: 'Caption', type: 'string'}),
          ],
        }),
      ],
    }),
  ],
})

// ── 3. blockCard ──────────────────────────────────────────────────────────────

export const blockCard = defineType({
  name: 'blockCard',
  title: 'Card',
  type: 'object',
  preview: {
    select: {items: 'items'},
    prepare({items}: {items?: unknown[]}) {
      const count = Array.isArray(items) ? items.length : 0
      return {title: 'Card', subtitle: `${count} item${count !== 1 ? 's' : ''}`}
    },
  },
  fields: [
    defineField({
      name: 'items',
      title: 'Items',
      type: 'array',
      validation: (Rule) => Rule.required().min(1).max(3),
      of: [
        defineArrayMember({
          type: 'object',
          name: 'cardItem',
          title: 'Card',
          preview: {
            select: {icon: 'icon', value: 'value', unit: 'unit', title: 'title'},
            prepare({
              icon,
              value,
              unit,
              title,
            }: {
              icon?: string
              value?: string
              unit?: string
              title?: string
            }) {
              const lead = value ? [value, unit].filter(Boolean).join(' ') : (icon ?? 'Card')
              return {title: lead, subtitle: title}
            },
          },
          fields: [
            defineField({
              name: 'icon',
              title: 'Icon',
              type: 'string',
              components: {input: IconInput},
            }),
            defineField({name: 'value', title: 'Data — Value', type: 'string'}),
            defineField({name: 'unit', title: 'Data — Unit', type: 'string'}),
            defineField({name: 'title', title: 'Title', type: 'text', rows: 3}),
            defineField({
              name: 'description',
              title: 'Description',
              type: 'array',
              of: [
                defineArrayMember({
                  type: 'block',
                  styles: [{title: 'Normal', value: 'normal'}],
                  lists: [],
                  marks: {
                    decorators: [
                      {title: 'Strong', value: 'strong'},
                      {title: 'Emphasis', value: 'em'},
                    ],
                    annotations: [],
                  },
                }),
              ],
            }),
            defineField({
              name: 'color',
              title: 'Color',
              type: 'string',
              components: {input: ColorInput},
            }),
          ],
        }),
      ],
    }),
    defineField({name: 'caption', title: 'Caption', type: 'string'}),
  ],
})

// ── 4. blockQuote ─────────────────────────────────────────────────────────────

export const blockQuote = defineType({
  name: 'blockQuote',
  title: 'Quote',
  type: 'object',
  preview: {
    select: {author: 'author'},
    prepare({author}: {author?: string}) {
      return {title: 'Quote', subtitle: author}
    },
  },
  fields: [
    defineField({
      name: 'quote',
      title: 'Quote',
      type: 'text',
      rows: 4,
      validation: (Rule) => Rule.required(),
    }),
    defineField({name: 'author', title: 'Author', type: 'string'}),
    defineField({name: 'authorRole', title: 'Role / Title', type: 'string'}),
    defineField({
      name: 'avatar',
      title: 'Avatar',
      type: 'image',
      options: {hotspot: true},
    }),
  ],
})

// ── 5. blockCallout ───────────────────────────────────────────────────────────

export const blockCallout = defineType({
  name: 'blockCallout',
  title: 'Callout',
  type: 'object',
  preview: {
    select: {variant: 'variant', title: 'title'},
    prepare({variant, title}: {variant?: string; title?: string}) {
      return {
        title: 'Callout',
        subtitle: title ? `${variant} — ${title}` : variant,
      }
    },
  },
  fields: [
    defineField({
      name: 'variant',
      title: 'Variant',
      type: 'string',
      options: {
        list: [
          {title: 'Insight', value: 'insight'},
          {title: 'Warning', value: 'warning'},
          {title: 'Tip', value: 'tip'},
          {title: 'Result', value: 'result'},
        ],
        layout: 'radio',
      },
      initialValue: 'insight',
      validation: (Rule) => Rule.required(),
    }),
    defineField({name: 'title', title: 'Title', type: 'string'}),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'text',
      rows: 4,
      validation: (Rule) => Rule.required(),
    }),
  ],
})

// ── 6. blockIntegration ───────────────────────────────────────────────────────

export const blockIntegration = defineType({
  name: 'blockIntegration',
  title: 'Integration',
  type: 'object',
  preview: {
    select: {provider: 'provider', url: 'url'},
    prepare({provider, url}: {provider?: string; url?: string}) {
      return {
        title: 'Integration',
        subtitle: [provider, url].filter(Boolean).join(' — '),
      }
    },
  },
  fields: [
    defineField({
      name: 'provider',
      title: 'Provider',
      type: 'string',
      options: {
        list: [
          {title: 'Figma', value: 'figma'},
          {title: 'YouTube', value: 'youtube'},
          {title: 'Vimeo', value: 'vimeo'},
          {title: 'Lottie', value: 'lottie'},
          {title: 'CodeSandbox', value: 'codesandbox'},
          {title: 'Other', value: 'other'},
        ],
        layout: 'radio',
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'url',
      title: 'URL',
      type: 'url',
      validation: (Rule) => Rule.required(),
    }),
    defineField({name: 'caption', title: 'Caption', type: 'string'}),
  ],
})

// ── 7. sectionType ────────────────────────────────────────────────────────────

export const sectionType = defineType({
  name: 'section',
  title: 'Section',
  type: 'object',
  preview: {
    select: {title: 'title', blocks: 'blocks'},
    prepare({title, blocks}: {title?: string; blocks?: unknown[]}) {
      const count = Array.isArray(blocks) ? blocks.length : 0
      return {
        title: title ?? 'Section',
        subtitle: `${count} block${count !== 1 ? 's' : ''}`,
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
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'blocks',
      title: 'Blocks',
      type: 'array',
      validation: (Rule) => Rule.required().min(1),
      of: [
        defineArrayMember({type: 'blockText'}),
        defineArrayMember({type: 'blockMedia'}),
        defineArrayMember({type: 'blockCard'}),
        defineArrayMember({type: 'blockQuote'}),
        defineArrayMember({type: 'blockCallout'}),
      ],
    }),
  ],
})
