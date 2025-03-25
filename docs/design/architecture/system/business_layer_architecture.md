# Business Layer Architecture (Discrete Low Level "god" Functions)

## Runtime State

Runtime state is broken down the following areas of concerns:

* Projected Configuration (from Data Layer)
* Introspected State (Kubernetes, Podman, Docker, KinD, Helm, etc)
* Computed State (Calculated values)
* Indirect User Input (Presentation Layer -> Workflow Layer -> Business Layer)

### General Terminology

* **Projected Configuration**: Configuration values which are projected from the data layer. These
  values should be immutable and are used to configure the behavior of the business logic. Mutations
  may only occur through explicit methods which delegate to the data layer. Projected configuration
  values may or may not correlate to the actual configuration values used by the underlying
  data layer models.
* **Introspected State**: State which is introspected from the underlying runtime environment. This
  state must be immutable.
* **Computed State**: State which is calculated by the business logic. This state may or may not be
  mutable. Mutations should typically occur through well-defined methods or properties.
* **Indirect User Input**: User input which is supplied to the business logic through the workflow
  layer and may originate from either the presentation or workflow layers.
  All values should be assumed insecure and must be validated/sanitized before being used by the
  business logic.
* **Runtime State**: The combination of projected configuration, introspected state, computed state,
  and indirect user input. This state is used by the business logic to execute its functions.

### Standards

Solo depends on several types of internal state when executing business logic. The majority of this
state is either projected or computed. In order to maintain consistency, clarity, and reusability
of the business logic, the runtime state needs to be clearly defined, properly encapsulated,
and well documented.

Runtime state should be declared as a clearly defined interfaces and abstract classes designed for
injection into other business logic components. The concrete implementations should never be directly
referenced by any other system components. Construction of runtime state implementations may be
handled by injected factory classes. All logic necessary to construct the runtime state from
the data layer, other business objects, the workflow layer, or the presentation layer should be
self-contained within this model. Implementations of runtime state which represent data supplied by
other layers (eg: projected configuration) must be immutable. Mutations to configuration data from
mutable data sources (eg: local or remote configuration) should be handled by well-defined methods
which delegate to the data layer.

Computed state may or may be directly mutated. It is the responsibility of each interface or API
to clearly define and communicate the mutability of the computed state for which the component is
responsible.

Indirect user input originates from the workflow layer. The workflow layer is responsible for
instantiating the appropriate objects and passing them to the business logic calls as required. It
is the responsibility of the runtime state module to clearly define a well documented API for consumption
by the workflow layer.

All runtime state APIs must clearly separate the concerns of projected configuration, introspected
state, computed state, and indirect user input. This separation is critical to ensure that the business
logic is clear, concise, and maintainable. Additionally, this API should provide hints to both the
workflow layer and the business logic as to the type and source of a given piece of state. Within the
major areas of concern, the runtime state API should separate data into logical groupings which represent
a single area of responsibility (eg: deployment).

\[todo]: <> "Move the X to the technical design doc"

#### Example API Definition (Interface)

```typescript
import {NamespaceName} from "./namespace_name.js";
import {ClusterRef} from "./types.js";

/**
 * Deployments consist of information supplied in the environment, local, and remote configuration
 * data sources. This information is projected into the runtime state and used by the business logic.
 */
interface Deployment {
  readonly clusters: Cluster[];
  readonly namespace: NamespaceName;
  readonly versions: ComponentVersions;
  // Additional Fields Here
}
```
