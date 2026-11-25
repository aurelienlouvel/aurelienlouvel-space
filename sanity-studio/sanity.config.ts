import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {orderableDocumentListDeskItem} from '@sanity/orderable-document-list'
import {schemaTypes} from './schemaTypes'
import {
  ArtifactNavIcon,
  ExperienceNavIcon,
  ContractTypeNavIcon,
  ProjectNavIcon,
  TagNavIcon,
  OrganisationNavIcon,
  PersonNavIcon,
  ProfileNavIcon,
  RoleNavIcon,
  ToolNavIcon,
  EducationNavIcon,
  VolunteerNavIcon,
  AwardNavIcon,
  SideProjectNavIcon,
} from './schemaTypes/components/navIcons'

export default defineConfig({
  name: 'default',
  title: 'oré ˖ ࣪⊹',

  projectId: '87awwrcu',
  dataset: 'production',

  plugins: [
    structureTool({
      structure: (S, context) =>
        S.list()
          .title('Content')
          .items([
            S.listItem()
              .title('Profile')
              .icon(ProfileNavIcon)
              .child(
                S.document().schemaType('profile').documentId('profile').title('Profile'),
              ),
            orderableDocumentListDeskItem({
              type: 'project',
              title: 'Project',
              icon: ProjectNavIcon,
              S,
              context,
            }),
            orderableDocumentListDeskItem({
              type: 'artifact',
              title: 'Artifact',
              icon: ArtifactNavIcon,
              S,
              context,
            }),
            orderableDocumentListDeskItem({
              type: 'experience',
              title: 'Experience',
              icon: ExperienceNavIcon,
              S,
              context,
            }),
            orderableDocumentListDeskItem({
              type: 'sideProject',
              title: 'Side project',
              icon: SideProjectNavIcon,
              S,
              context,
            }),
            orderableDocumentListDeskItem({
              type: 'education',
              title: 'Education',
              icon: EducationNavIcon,
              S,
              context,
            }),
            orderableDocumentListDeskItem({
              type: 'volunteer',
              title: 'Volunteer',
              icon: VolunteerNavIcon,
              S,
              context,
            }),
            orderableDocumentListDeskItem({
              type: 'award',
              title: 'Award',
              icon: AwardNavIcon,
              S,
              context,
            }),
            S.documentTypeListItem('contractType').title('Contract type').icon(ContractTypeNavIcon),
            orderableDocumentListDeskItem({
              type: 'tool',
              title: 'Tool',
              icon: ToolNavIcon,
              S,
              context,
            }),
            orderableDocumentListDeskItem({
              type: 'toolGroup',
              title: 'Tool group',
              icon: ToolNavIcon,
              S,
              context,
            }),
            S.documentTypeListItem('tag').title('Tag').icon(TagNavIcon),
            S.documentTypeListItem('organisation').title('Organisation').icon(OrganisationNavIcon),
            S.documentTypeListItem('person').title('Person').icon(PersonNavIcon),
            S.documentTypeListItem('role').title('Role').icon(RoleNavIcon),
          ]),
    }),
    visionTool(),
  ],

  schema: {
    types: schemaTypes,
  },
})
