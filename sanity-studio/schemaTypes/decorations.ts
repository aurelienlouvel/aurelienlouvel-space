import {defineArrayMember, defineField, defineType} from 'sanity'

export const decorationsType = defineType({
  name: 'decorations',
  title: 'Decorations',
  type: 'document',
  fields: [
    defineField({
      name: 'doodles',
      title: 'Doodles personnalisés',
      description:
        'Images éparpillées en fond du canvas /play, en plus des formes procédurales existantes',
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
