import {defineField, defineType} from 'sanity'

export const toolType = defineType({
  name: 'tool',
  title: 'Tool',
  type: 'document',
  preview: {
    select: {title: 'name', media: 'logo'},
  },
  fields: [
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
