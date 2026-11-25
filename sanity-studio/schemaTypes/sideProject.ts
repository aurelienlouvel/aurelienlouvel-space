import {defineField, defineType} from 'sanity'
import {orderRankField} from '@sanity/orderable-document-list'
import {descriptionField} from './lib/descriptionField'

export const sideProjectType = defineType({
  name: 'sideProject',
  title: 'Side project',
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
        title: title ?? 'Untitled side project',
        subtitle,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        media: media as any,
      }
    },
  },
  fields: [
    orderRankField({type: 'sideProject'}),
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'organisation',
      title: 'Organisation',
      description: 'Optional: the logo and website of the organisation are shown on the row.',
      type: 'reference',
      to: [{type: 'organisation'}],
    }),
    defineField({
      name: 'url',
      title: 'URL',
      description: 'Optional: the project link. Takes precedence over the organisation website.',
      type: 'url',
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
