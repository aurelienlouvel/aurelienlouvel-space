import {defineField, defineType} from 'sanity'
import {orderRankField} from '@sanity/orderable-document-list'

export const toolType = defineType({
  name: 'tool',
  title: 'Tool',
  type: 'document',
  orderings: [
    {
      title: 'Manual order',
      name: 'orderRank',
      by: [{field: 'orderRank', direction: 'asc'}],
    },
  ],
  preview: {
    select: {title: 'name', media: 'logo', subtitle: 'group.name'},
  },
  fields: [
    orderRankField({type: 'tool'}),
    defineField({
      name: 'group',
      title: 'Group',
      description: 'The tool group it is shown in on the Info page.',
      type: 'reference',
      to: [{type: 'toolGroup'}],
    }),
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'logo',
      title: 'Logo',
      type: 'image',
      options: {hotspot: true},
    }),
    defineField({
      name: 'url',
      title: 'Link',
      type: 'url',
    }),
    defineField({
      name: 'referral',
      title: 'Referral',
      type: 'boolean',
      initialValue: false,
    }),
  ],
})
