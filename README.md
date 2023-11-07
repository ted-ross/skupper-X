# Skupper-X

A multi-tenant Virtual Application Network solution that controls both the *network topology* and the *application topology* of distributed software systems.

_This is a research platform.  It is being used to do rapid-prototyping of some new ideas around distributed application definition, deployment, and lifecycle._

Features:

* Time-boxed, invitation-based participation in a VAN
* VAN-owners do not need to consider the topology of the network of routers, only which sites participate
* Centralized management, monitoring, and audit of all of the VANs in the installation
* Supports DMZ-deployed routers
* Git-ops support for deploying and managing a VAN
* Site-scoped addressing for multiple workload instances so individual sites can be independently addressed
* TLS-based security
* Integration with the customer's PKI system
* Automatic and seamless rotation of x.509 certificates
* Forcible removal of an entire VAN as one operation
* Forcible removal of a site/participant from the VAN

## Central Concepts for Network Topology

"Network Topology" is concerned with the spatial layout and connectivity of locations where components of distributed software systems may reside.  This is the dimension of Application Networking that is most closely associated with the underlying data networking infrastructure.

### The Service

The Service is the central management component of Skupper-X.  It uses a relational database as a central store for state and configuration and provides an administrative API/Console for the purpose of configuring and managing the use of Skupper-X.

The Service may be distributed for high availability.  It is not intended to operate solely as a public service, but could be used in such a way.  It is intended to be installable at an enterprise of any size for the purpose of coordinating Application Networking across that enterprise.

### Network Backbones

The Service allows for the establishment of zero or more Network Backbones.  A Network Backbone is a multi-tenant constellation of intermediate relay points that can be used to carry application traffic efficiently between network locations.

When setting up a Network Backbone, it is advisable to be cognizant of the underlying IP networks and to construct the backbone connectivity in such a way that availability, performance, and cost are optimized appropriately.

Network Backbone setup is an administrative-level activity in Skupper-X.  Once the appropriate set of backbones are established, end users simply choose (or are assigned) a backbone on which to run their Application Networks.

### Application Networks

Application Networks are collections of network sites (locations in the Network Topology) where a user wishes to deploy components of a distributed software system.  An Application Network is built on a single Network Backbone.  The underlying network topology is not a concern to the Application Network and is not visible to the users of the Application Network.

### Invitation Claims, Sites, and Site Classes

Sites join an Application Network by Invitation.  An Invitation is a claim to access an Application Network.  The Invitation Claim may be for a single use (i.e. to add one site to the application network) or it may be widely disseminated to invite a larger audience to participate in the application network.

A Site is established as a result of the application and acceptance of an Invitation Claim.  As stated above, multiple sites may be created from a single invitation.  When there are many sites involved in an application network, it may be useful to assign site-classes to the sites.  For a retail use case, the classes might include "warehouse", "storefront", and "headquarters".  This allows subsets of sites to be treated in the same way.

All of the sites in an application network are able to host components of a distributed software system such that those components can securely interact with one another normally without regard for their actual location in the underlying physical data network.

## Central Concepts for Application Topology

"Application Topology" is concerned with the logical layout of distributed software systems.  The various software components involved and the exact way in which these components interact with one another is the business of Application Topology.  This dimension is orthogonal to Network Topology.  The only tie between the two dimensions is the allocation of software components in the Application Topology to sites in the Network Topology.

### Attach Points with Roles

An Attach Point is a site-specific way that a software component can interact with other components.  A Role describes the way that the attached software component interacts.  From a model persective, this concept is quite general in order to be able to describe a wide variety of possible interactions.

Roles are extensible to support future interaction patterns.  The initial set of roles is as follows:

 - **Connect** - An attach point for this role is a listening socket to be used by components that _connect_ to other components using a stream socket (i.e. TCP).
 - **Accept** - The counterpart for _Connect_.  A connecting socket that extablishes connections to components that _accept_ incoming connections via a stream socket.
 - **Send** - An attach point used by components that _send_ data messages to other components.  This could be a datagram socket or a messaging endpoint.
 - **Receive** - The counterpart for _Send_.
 - **AsyncRequest** - An attach point for components that issue asynchronous requests to peers.
 - **AsyncReply** - The counterpart for _AsyncRequest_.
 - **Peer** - An attach point that for shared access to a channel.  This could be an IP subnet where each attached component is assigned a unicast IP address within the subnet.

### Links

A Link is a collection of related attach points within an application network.  The link connects all of the associated attach points according to their individual roles.

Note that this is very different from a model in which connectivity is achieved using addresses, where an offered "service" using an address can be accessed by others that know the address and thereby use the service.  The link concept is a more tightly defined set of participants for a particular interaction.  This allows better security and tighter control on who can talk to what.

The link controls data distribution, whether it is anycast or multicast.  It also controls the scope of addressing for the underlying communication.  VAN-scope means that all linked service providers share the data load, either as multicast or by load balancing anycast.  Site scope allows service providers in different sites to be individually addressed.

### Components

A Component is an entity that uses attach points to interact with other components.  An obvious instance of a component is a running software process, or container, that either offers services or requires the services of others.  Components can also be ingresses or egresses on the application network.  Since the application network is isolated from the outside, an ingress is used to allow outside consumers to access the services od the application network.  Likewise, an egress is used to allow the application network to access resources outside of itself.

Note that this model considers components to be optional elements of an application.  An application network can be built solely of attach points and links, leaving the deployment of attaching software as an external concern.  The model contains the concept of _component_ (and _component type_) so it can also be used to deploy and manage the whole distributed software system.

### Component and Attach-Point Types

Both components and attach points can be typed.  A component type is typically a container image or a software package.  An attach point type is a formally specified API (in a broad sense) that identifies roles and a contract between participants.  A component type may be annotated with attach point type and roles (i.e. this software package offers or requires a particular API).

Component types and attach point types may be contained within a library that is searchable to support component re-use in the composition of distributed software systems.

## Architecture

### Management and Control Plane

#### Database

#### Management Controller

#### Site Controller

### Data Plane

### x.509 Certificate Architecture

### Claim-to-Site Bootstrapping

### APIs and User Access

 - **Service Administrator** - Can create, delete, and manage all backbones and application networks.
 - **Backbone Administator** - Can manage assigned backbone and all of its application networks.
 - **User** - Can create, delete, and manage application networks on permitted backbones.
 - **Participant** - Can accept an invitation and see/manage only the access points in their site.  No central user authentication is needed.  The invitation claim is the only credential needed to participate.

## Demo Scenarios

### Customer Prem Software

#### Sequence

1. User creates a new Application Network
1. User generates an invitation for the headquarters site
1. HQ invitation is invoked on a namespace
1. User creates a site class for "gold"
1. User creates an invitation for "customer-A" for site-class "gold"
1. Customer-A invokes the invitation in their namespace
1. User observes the joining of HQ and customer-A in the application network console
1. User composes an application with HQ and customer-prem container images and interconnect dependencies
1. User allocates components of the application to HQ and to "gold"
1. Customer-A opens the site console and sees the list of changes the application wants to make locally
1. Customer-A accepts all changes
1. Customer-A observes the deployment of artifacts locally
1. Repeat for Customer-B
1. Customer-B declines the deployment of one component (the customer monitoring image)
1. User observes that no ingress is created at HQ for Customer-B monitoring

### Retail Chain

1. Use git-ops to deploy an application across the enterprise.
1. Onboard a new retail location via site class and watch it automatically deploy.
1. Observe ingress-per-location in the headquarters site (site-scoped addresses).
1. Perform a trial upgrade of the application on one site, then continue to all sites overnight.

### Hands-on software training in distance learning

1. Invite all students to the collaboration.
1. Provide a partially complete distributed application involving student sites and the professor's site.
1. Allow students to develop components that interact with the distributed application.
1. Tear it all down at the end of the session.
