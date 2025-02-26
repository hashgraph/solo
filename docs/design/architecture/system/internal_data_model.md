# Internal Data Model

Solo internally maintains several critical path data models which support various features. 
As of the 0.35 release of Solo, these models are not clearly defined and documented. These models 
are also intermingled in public/private API implementations, user input/output implementations, 
business logic implementations, runtime introspection implementations, and other such areas.

The goal of this document is to present a clear and concise definition of the internal data models
and propose a plan to refactor the codebase to separate these models from the rest of the codebase.

## Problem Statement

The current state of the Solo codebase is such that the internal data models are not clearly defined
and documented. This leads to several issues:

1. **Code Duplication**: The same data model is defined in multiple places in the codebase.
2. **Inconsistency**: The same data model is defined differently in different places in the codebase.
3. **Complexity**: The codebase is difficult to understand and maintain due to the lack of clear data models.
4. **Scalability**: The codebase is not scalable due to the lack of clear data models.
5. **Extensibility**: The codebase is not extensible due to the lack of clear data models.
6. **Testability**: The codebase is not easily testable due to the lack of clear data models.
7. **Readability**: The codebase is not readable due to the lack of clear data models.

## 



