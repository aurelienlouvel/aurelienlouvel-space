import {defineField, defineType} from 'sanity'
import {orderRankField} from '@sanity/orderable-document-list'
import {descriptionField} from './lib/descriptionField'

export const awardType = defineType({
  name: 'award',
  title: 'Award',
  type: 'document',
  orderings: [
    {
      title: 'Manual order',
      name: 'orderRank',
      by: [{field: 'orderRank', direction: 'asc'}],
    },
    {
      title: 'Date, newest',
      name: 'dateDesc',
      by: [{field: 'date', direction: 'desc'}],
    },
  ],
  preview: {
    select: {
      title: 'title',
      subtitle: 'organisation.name',
      media: 'organisation.logo',
    },
    prepare({title, subtitle, media}: {title?: string; subtitle?: string; media?: unknown}) {
      return {
        title: title ?? 'Untitled award',
        subtitle,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        media: media as any,
      }
    },
  },
  fields: [
    orderRankField({type: 'award'}),
    defineField({
      name: 'title',
      title: 'Award',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'organisation',
      title: 'Issued by',
      type: 'reference',
      to: [{type: 'organisation'}],
    }),
    defineField({
      name: 'date',
      title: 'Date',
      type: 'date',
      options: {dateFormat: 'YYYY-MM-DD'},
    }),
    descriptionField,
  ],
})
