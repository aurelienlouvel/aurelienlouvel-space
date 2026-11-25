import {defineArrayMember, defineField} from 'sanity'

// Short rich text for Info entries (experience, education, award, volunteer,
// sideProject): paragraphs, bold/italic and links only.
export const descriptionField = defineField({
  name: 'description',
  title: 'Description',
  description: 'The story of this entry and what you did.',
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
})
