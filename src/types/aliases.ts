/** the number of the node */ export type NodeId = number
/** the alias of the node */ export type NodeAlias = `node-${number}`
/** the full pod name */ export type PodName = `network-${NodeAlias}-0`

/** list of the number of nodes */ export type NodeIds = NodeId[]
/** list of the pod aliases */ export type NodeAliases = NodeAlias[]
/** list of the pod names */ export type PodNames = PodName[]