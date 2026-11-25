import {defineField, defineType} from 'sanity'
import {orderRankField} from '@sanity/orderable-document-list'
import {descriptionField} from './lib/descriptionField'

export const educationType = defineType({
  name: 'education',
  title: 'Education',
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
      subtitle: 'organisation.name',
      media: 'organisation.logo',
    },
    prepare({title, subtitle, media}: {title?: string; subtitle?: string; media?: unknown}) {
      return {
        title: title ?? 'Untitled education',
        subtitle,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        media: media as any,
      }
    },
  },
  fields: [
    orderRankField({type: 'education'}),
    defineField({
      name: 'title',
      title: 'Program / Degree',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'organisation',
      title: 'School',
      type: 'reference',
      to: [{type: 'organisation'}],
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
    descriptionField,
  ],
})
