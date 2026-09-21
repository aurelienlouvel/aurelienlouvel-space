import {defineField, defineType} from 'sanity'
import {orderRankField} from '@sanity/orderable-document-list'

export const artifactType = defineType({
  name: 'artifact',
  title: 'Artifact',
  type: 'document',
  orderings: [
    {
      title: 'Manual order',
      name: 'orderRank',
      by: [{field: 'orderRank', direction: 'asc'}],
    },
    {
      title: 'Start date, newest',
      name: 'startDateDesc',
      by: [{field: 'startDate', direction: 'desc'}],
    },
  ],
  preview: {
    select: {
      title: 'title',
      media: 'gallery.0.image',
    },
    prepare({title, media}: {title?: string; media?: unknown}) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return {title: title ?? 'Untitled artifact', media: media as any}
    },
  },
  fields: [
    orderRankField({type: 'artifact'}),
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'title'},
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 4,
    }),
    defineField({
      name: 'link',
      title: 'Link',
      type: 'url',
    }),
    defineField({
      name: 'gallery',
      title: 'Gallery',
      type: 'array',
      validation: (Rule) => Rule.required().min(1),
      of: [
        {
          type: 'object',
          name: 'galleryImage',
          title: 'Image',
          preview: {
            select: {media: 'image', title: 'caption'},
            prepare({media, title}: {media?: unknown; title?: string}) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              return {title: title ?? 'Image', media: media as any}
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
          name: 'galleryVideo',
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
      ],
    }),
    defineField({
      name: 'tags',
      title: 'Tags',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'tag'}]}],
    }),
    defineField({
      name: 'contributors',
      title: 'Mates',
      type: 'array',
      of: [
        {
          type: 'object',
          name: 'contributor',
          title: 'Contributor',
          preview: {
            select: {
              firstName: 'person.firstName',
              lastName: 'person.lastName',
              media: 'person.avatar',
            },
            prepare({
              firstName,
              lastName,
              media,
            }: {
              firstName?: string
              lastName?: string
              media?: unknown
            }) {
              return {
                title: [firstName, lastName].filter(Boolean).join(' ') || 'Unknown',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                media: media as any,
              }
            },
          },
          fields: [
            defineField({
              name: 'person',
              title: 'Person',
              type: 'reference',
              to: [{type: 'person'}],
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'roles',
              title: 'Roles',
              type: 'array',
              of: [{type: 'reference', to: [{type: 'role'}]}],
            }),
          ],
        },
      ],
    }),
    defineField({
      name: 'startDate',
      title: 'Start date',
      type: 'date',
      options: {dateFormat: 'YYYY-MM-DD'},
    }),
    defineField({
      name: 'endDate',
      title: 'End date',
      type: 'date',
      options: {dateFormat: 'YYYY-MM-DD'},
    }),
    defineField({
      name: 'roles',
      title: 'Roles',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'role'}]}],
    }),
  ],
})
