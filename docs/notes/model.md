# Model
The Service model is divided into two independent parts:  Network Topology and Application Topology.

The Network Topology is concerned with the set of sites in the Service and how those sites are securely interconnected.  It is also concerned with the various ephemeral Application Networks and which sites they participate in.

The Application Topology is concerned with the workloads that run on the application networks and how those particular components interact with one another.

There is one small section of the model that connects the Network Topology to the Application Topology.  This is the mapping of Application Components to Application Network Sites.

## Network Topology

## Application Topology
Application Topology is divided into two parts:  Unallocated Application Definition and Allocated Application Definition.  The unallocated part represents software components and how they want to interact with each other.  The allocated definition represents those components as they are allocated to sites in a running application network and how they are interconnected.

### Unallocated Application Definition
This part of the model describes the building blocks of distributed software systems.  This definition is in the form of a library of potential components as they are not allocated to any specific application network or application network site.

* Type: Role
* Image Template
* Service
* Service Attach

The structure of this model is that there are Image Templates that describe processes or pods (sets of tightly coupled processes).  Components defined by Images participate in Service Interaction with other Images.  A Service describes the interaction between Components, with each participating Component having a Role in that interaction.

Note that the unallocated application definition can be globally scoped or scoped to an application network.  Network scoping is useful for when an application network's application topology is managed via git-ops.

#### Role Type
The Role type designates the role of a particular Component with respect to a particular Service in which it participates.  It is expected that the set of possible Roles will evolve over time.

Roles include:
* **Connect** - The Component establishes service connections that are accepted by a "server".
* **Accept** - The Component accepts incoming service connections from "clients".
* **Send** - The Component sends datagrams or messages to other Components.
* **Receive** - The Component receives datagrams or messages sent by other Components.
* **AsyncRequest** - The Component sends asynchronous requests to other Components that will eventually reply.
* **AsyncReply** - The Component receives requests and replies asynchronously to the requestors.

#### Image Template
An **Image Template** describes a process, container, or pod.  It designates the required binary images and their versions.  It may be required that multiple representations be provided for templates.  YAML can be used for Kubernetes-based deployment but other formats may be needed for bare-metal or container-system deployment.

#### Service
The **Service** describes a multi-role interaction between Components.  At its simplest, a Service associates a pair of roles together.  The Service can be elaborated upon by providing information like the following:

* The application protocol being carried in the payload of a connection-oriented exchange (i.e. HTTP, IMAP, etc.).
* Whether the binding of Component instances of different roles are to be persistent (i.e. stickiness) and the desired mechanism of persistence (HTTP session cookie, source IP address, etc.).
* The scope of addressing for instances of offered services (van, site, or instance).
* Validation data on the format of the payload.
* Etc.

#### Service Attach
The **Service Attach** binds a Service to an Image Template with a specific Role.  This specifies which role the Image expects to play in the distributed interaction.  The Service Attach can also provide the host name that a connecting role uses to connect to the accepting component.

### Allocated Application Definition
This part of the model describes the application as it has been allocated to the sites of an application network.  It consists of instantiations of library templates into running components.

* Component
* Service Link
* Service Link Attach

The structure of this model is that there are a set of Components and a set of Service Links.  Service Link Attaches map the Components to the Service Links for a particular Role.

A simple example might consist of a client component, a server component, and a REST Service Link.  The Service Link is bound to the client with role *Connect* and to the server with role *Accept*.  Now, wherever in the application network the client and server are allocated, the client will always be able to establish an HTTP/TCP connection to the server.

This example can be further expanded by having the server allocated to multiple sites or allocated multiply to the same sites.  Now there are attachments in the Service Link for one *Connect* and multiple *Accept* roles.  This will result in the various server instances balancing the connection load from the client.

Of course, multiple client components can also be allocated, resulting in a many-to-many association of components for the purpose of offering and using the REST service.

#### Component
A **Component** represents one or more connection points, with roles, into Service Links.  A Component is, by definition, instantiated in an application network site or a class of sites.  Components can be instantiated containers/processes/pods or they can be application network ingress or egress points for access to software components outside the application network.

#### Service Link
A **Service Link** represents the interconnect between Components for a particular Service.

#### Service Link Attach
A **Service Link Attach** maps a Service Link to a Component for a Role.
