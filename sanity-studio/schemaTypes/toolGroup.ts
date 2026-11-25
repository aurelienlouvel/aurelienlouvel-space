import {defineField, defineType} from 'sanity'
import {orderRankField} from '@sanity/orderable-document-list'
import {ColorInput} from './components/ColorInput'

// Un petit groupe d'outils sur la page Info (ex. « Design », « Code ») : une
// couleur de fond, son nom en petit dessous. L'ordre des groupes se règle par
// glisser-déposer, celui des outils par l'ordre de la liste.
export const toolGroupType = defineType({
  name: 'toolGroup',
  title: 'Tool group',
  type: 'document',
  orderings: [
    {
      title: 'Manual order',
      name: 'orderRank',
      by: [{field: 'orderRank', direction: 'asc'}],
    },
  ],
  preview: {
    select: {title: 'name', media: 'tools.0.logo'},
  },
  fields: [
    orderRankField({type: 'toolGroup'}),
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'color',
      title: 'Color',
      type: 'string',
      components: {input: ColorInput},
    }),
    defineField({
      name: 'tools',
      title: 'Tools',
      description: 'Shown in this order.',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'tool'}]}],
      validation: (Rule) => Rule.unique(),
    }),
  ],
})
