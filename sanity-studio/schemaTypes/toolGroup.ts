import {defineField, defineType} from 'sanity'
import {orderRankField} from '@sanity/orderable-document-list'
import {ColorInput} from './components/ColorInput'

// Un petit groupe d'outils sur la page Info (ex. « Design », « Code ») : une
// couleur de fond, son nom en petit dessous. Chaque outil choisit son groupe
// (champ Group du tool). L'ordre des groupes, comme celui des outils, se règle
// par glisser-déposer.
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
    select: {title: 'name'},
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
  ],
})
