import {defineArrayMember, defineField, defineType} from 'sanity'

export const decorationsType = defineType({
  name: 'decorations',
  title: 'Decorations',
  type: 'document',
  fields: [
    defineField({
      name: 'doodles',
      title: 'Doodles personnalisés',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'image',
          options: {accept: 'image/png,image/webp'},
        }),
      ],
    }),
  ],
})
