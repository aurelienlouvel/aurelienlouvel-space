import {defineField, defineType} from 'sanity'
import {orderRankField} from '@sanity/orderable-document-list'
import {descriptionField} from './lib/descriptionField'

export const experienceType = defineType({
  name: 'experience',
  title: 'Experience',
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
        title: title ?? 'Untitled experience',
        subtitle,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        media: media as any,
      }
    },
  },
  fields: [
    orderRankField({type: 'experience'}),
    defineField({
      name: 'title',
      title: 'Job title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'contractType',
      title: 'Contract type',
      type: 'reference',
      to: [{type: 'contractType'}],
    }),
    defineField({
      name: 'organisation',
      title: 'Organisation',
      type: 'reference',
      to: [{type: 'organisation'}],
    }),
    defineField({
      name: 'roles',
      title: 'Roles',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'role'}]}],
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
