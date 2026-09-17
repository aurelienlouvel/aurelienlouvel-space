import {tagType} from './tag'
import {roleType} from './role'
import {organisationType} from './organisation'
import {personType} from './person'
import {profileType} from './profile'
import {toolType} from './tool'
import {
  blockText,
  blockMedia,
  blockCard,
  blockQuote,
  blockCallout,
  blockIntegration,
  sectionType,
} from './sections'
import {artifactType} from './artifact'
import {contractTypeType} from './contractType'
import {experienceType} from './experience'
import {educationType} from './education'
import {volunteerType} from './volunteer'
import {awardType} from './award'
import {projectType} from './project'

export const schemaTypes = [
  // Reusable references
  tagType,
  roleType,
  organisationType,
  personType,
  // Block object types
  blockText,
  blockMedia,
  blockCard,
  blockQuote,
  blockCallout,
  blockIntegration,
  sectionType,
  // Documents
  artifactType,
  contractTypeType,
  experienceType,
  educationType,
  volunteerType,
  awardType,
  projectType,
  profileType,
  toolType,
]
