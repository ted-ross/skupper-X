# Skupper-X

A multi-tenant Virtual Application Network solution that controls both the *network topology* and the *application topology* of distributed software systems.

_This is a research platform.  It is being used to do rapid-prototyping of some new ideas around distributed application definition, deployment, and lifecycle._

Features:

* Time-boxed, invitation-based participation in a VAN
* VAN-owners do not need to consider the topology of the network of routers, only which sites participate
* Centralized management, monitoring, and audit of all of the VANs in the installation
* Supports DMZ-deployed routers
* Git-ops support for deploying and managing a VAN
* TLS-based security
* Integration with the user's PKI system
* Automatic and seamless rotation of x.509 certificates
* Forcible removal of an entire VAN as one operation
* Forcible removal of a site/participant from the VAN

## Principles

 * Distributed domain of trust - don't expect/require components of an application to authenticate to each other.
 * App network is isolated - no ingress or attack surface unless expressly created.
 * No authentication needed to participate in networked applications.
 * The workflow for application network setup is similar to that of setting up a video-conference meeting.
 * Network topology and Application topology are orthogonal.  Each can change dynamically without affecting the other.

## Skupper-X Subsystems

There are three separate parts of Skupper-X that work together to meet the above requirements:

__Skupper-X Network__ - Concerns the communication infrastructure and the setup of Application Networks.

__Skupper-X Compose__ - Provides tools for the formal composition of distributed software systems.

__Skupper-X Deploy__ - Deploys a Composed Application onto an Application Network.  Deployment is an ongoing process that reacts to changes in the underlying network and application-driven deployment changes.

## Central Concepts for Network Topology

"Network Topology" is concerned with the spatial layout and connectivity of locations where components of distributed software systems may reside.  This is the dimension of Application Networking that is most closely associated with the underlying data networking infrastructure.

### The Service

The Service is the central management component of Skupper-X.  It uses a relational database as a central store for state and configuration and provides an administrative API/Console for the purpose of configuring and managing the use of Skupper-X.

The Service may be distributed for high availability.  It is not intended to operate solely as a public service, but could be used in such a way.  It is intended to be installable at an enterprise of any size for the purpose of coordinating Application Networking across the world on behalf of that enterprise.

### Network Backbones

The Service allows for the establishment of zero or more Network Backbones.  A Network Backbone is a multi-tenant constellation of intermediate relay points that can be used to carry application traffic efficiently between network locations.

When setting up a Network Backbone, it is advisable to be cognizant of the underlying IP networks and to construct the backbone connectivity in such a way that availability, performance, and cost are optimized appropriately.

Network Backbone setup is an administrative-level activity in Skupper-X.  Once the appropriate set of backbones are established, end users simply choose (or are assigned) a backbone on which to run their Application Networks.

### Application Networks

Application Networks are collections of network sites (locations in the Network Topology) where a user wishes to deploy components of a distributed software system.  An Application Network is built on a single Network Backbone.  The underlying network topology is not of concern to the Application Network and is not visible to the users of the Application Network.

### Invitation Claims, Sites, and Site Classes

Sites join an Application Network by Invitation.  An Invitation is a claim to access an Application Network.  The Invitation Claim may be for a single use (i.e. to add one site to the application network) or it may be widely disseminated to invite a larger audience to participate in the application network.

A Site is established as a result of the application and acceptance of an Invitation Claim.  As stated above, multiple sites may be created from a single invitation.  When there are many sites involved in an application network, it may be useful to assign site-classes to the sites.  For a retail use case, the classes might include "warehouse", "storefront", and "headquarters".  This allows subsets of sites to be treated in the same way.

All of the sites in an application network are able to host components of a distributed software system such that those components can securely interact with one another normally without regard for their actual location in the underlying physical data network.

## Central Concepts for Application Topology

"Application Topology" is concerned with the logical layout of distributed software systems.  The various software components involved and the exact way in which these components interact with one another is the business of Application Topology.  This dimension is orthogonal to Network Topology.  The only tie between the two dimensions is the allocation of software components in the Application Topology to sites in the Network Topology.



## Architecture of Skupper-X

### Management and Control Plane

The management plane components are logically centralized.  They may be physically distributed and replicated for availability and scale.  The management plane does not need to be deployed in the most "public" location.  Participating sites may join application networks from locations that cannot access the management plane via TCP/IP.

Skupper-X management plane components are deployed on Kubernetes.  Backbone and Application Network sites can run on a wide variety of platforms and do not require Kubernetes.

#### Database

A relational database (Postgres) is used as the central persistent store of configuration and current state.  The schema for the database can be found in `scripts/db-setup.sql`.

#### Certificate Management

The `cert-manager` package is installed as part of the management plane.  This component orchestrates the creation and maintenance of x.509 certificates.  It provides flexibility into how the PKI (Private Key Infrastructure) is operated in the customer's environment.

#### Management Controller

The management controller orchestrates the setup and maintenance of backbone networks, application networks, intivation claims, and member sites.  It also manages the creation, deletion, and rotation of x.509 certificates.  It provides an API that can be used by an administrative console or external software components.

#### Site Controller

The site controller runs at backbone sites and at application network member sites.  It communicates in-band with the management controller and orchestrates the setup, maintenance, and monitoring of local certificates, access points, and application components.

The site controller provides an API for local control and monitoring.  The API supports a local console usable by application network participants.

### Data Plane

The data plane in use is the Skupper router network.  This provides maximum flexibility and ease of setup due to its highly abstract nature.  The architecture will be developed with a mind toward as narrow as possible a coupling between the data plane and the other components of the architecture in order to open the possibility of supporting other data planes.

### x.509 Certificate Architecture

A hierarchy of intermediate certificate authorities (CAs) is used to provide security across the backbones and the application networks.  The root CA for the entire system is external and must be established by the administrator before any subservient CAs or certificates can be created and signed.

The hierarchy is as follows, with certificates being signed by their immediate superior:

 * (Root CA)
    * Backbone CA
        * Backbone Site Certificate
        * Application Network CA
            * Invitation Claim Certificate
            * Member Site Certificate

The hierarchy allows for entire subtrees (application networks) to be invalidated in one operation.  Furthermore, individual member sites can be invalidated via expiration or revocation.

### Claim-to-Site Bootstrapping

When an application network is created, is is given a start time and an optional end time.  If the start time is in the future, the CA for the network is created immediately so that invitations to the network can be signed.  The network CA is not loaded into the backbone until right before the network's start time.  This prevents the invitation-claim certificates from being used prematurely.

The sequence of events from the creation of an invitation to the establishment of a member site is as follows:

 1. The invitation is created.  A certificate is created for the invitation and that certificate is signed by the application network CA.
 1. The invitation text is generated for a particular kind of environment (e.g. Kubernetes) and delivered by any means to the invitee(s).
 1. The invitee applies the invitation in their own environment.  This causes the site-controller executable to be launched.
 1. The site-controller uses the metadata in the invitation certificate-secret to deploy the dataplane component(s) and configure them to attach to the backbone using the invitation claim certificate.
 1. The connected backbone component validates the certificate and, seeing that it is an invitation claim, restricts the traffic flowing from the new site to the claim-redemption protocol.
 1. The site-controller contacts the management-controller via the backbone network and provides the claim.
 1. The management-controller validates the claim and if ok, creates a new member-site for the successful invitee.  This member site has a new certificate signed by the application-network CA.  This certificate is sent back to the site.
 1. The site-controller re-configures the data plane to connect with the new site certificate, granting full access to the application network via the backbone.
 1. The management-controller can then send the site-controller configuration for access points and possibly components that are intended to be deployed on that site.
 1. The site-controller can then either automatically deploy the configuration or present it to the participant user for approval.  In some cases, the access points may need to be locally modified to properly operate in the participant's environment.

### Personas, APIs, and User Access

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
