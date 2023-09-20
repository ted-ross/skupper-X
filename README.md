# Studio

## Database Tables

### Authentication and Session Tracking
* Users
* WebSessions

### Certificate Management
* TlsCertificates

### Interior Transit Backbone Network
* InteriorSites
* InterRouterLinks

### Image Library
* Images
* Services
* OfferedServices
* RequiredServices

### Application Network Topology
* ApplicationNetworks
* SiteClasses
* MemberInvitations
* EdgeLinks
* MemberSites

### Application Network Composition
* ServiceLinks
* Endpoints
   * Processes
   * Ingresses
   * Egresses

## Table Views

### Administrative Functions
* All Tables

### User Functions
* Available interior sites (access points)
* Application Networks owned by the User
* All Sub-tables associated with the Application Network
   * My MemberInvitations, Site Classes, and MemberSites
   * My Endpoints and ServiceLinks

### Site Functions
* Application Network Composition content associated with the Network and the Site
   * This site’s Endpoints and ServiceLinks

## Architectural Locations
Studio, being a distributed software system itself, has a number of logical locations in which its components operate.

### Service Home
The Service Home is the location where the central Studio service is headquartered.  This is likely a namespace, or groups of namespaces, in a Kubernetes cluster.  It may also be replicated across different clusters for availability.

### Interior Site
An Interior Site is the location where interior backbone routers operate.  This can be pretty much anywhere the Studio Administrator wishes to allow application owners to locate application network sites.

### Application Network Home
Each application network, created and maintained by a user, has a home location.  This is likely a namespace in a Kubernetes cluster accessible by the user.  It can also be a virtual or bare-metal host on which the user has user privileges.

### Application Network Site
An application network is built out of a collection of application network sites.  These can be anywhere including Kubernetes namespaces, container systems like Docker or Podman, virtual hosts, or bare-metal hosts.  An application network site comes into existence when a MemberInvitation is accepted and the application network is activated.  There may be a very large number of application network sites in an application network.  Application network sites are where the components that compose a user’s distributed application are deployed.

## Architectural Components
The Studio service is made up of a distributed set of software components that form the platform on which user applications run.

### Database
Location: Service Home

The central database holds all of the persistent state used throughout the Studio ecosystem.

### Certificate Management
Location: Service Home

The Certificate Management function is the central orchestrator for the handling of x.509 certificates that form the backbone of Studio’s security.  It uses the cert-manager service to perform the generation and signing of certificates.  It maintains the certificate-related tables in the central database and orchestrates the assignment, generation, revocation, and rotation of certificates for the entire Studio ecosystem.

### Interior Backbone Management
Location: Service Home

This component generates the artifacts required to set up the interior backbone network.  It also orchestrates the Interior Site Agents for the purpose of maintaining the backbone network.  One of these maintenance tasks is the rotation of certificates for inter-router links.  Another is the collection of summary metrics and status from all of the application networks.

### Application Network Management
Location: Application Network Home

This component handles all of the application network specific tasks.  This is where the flow-collector and prometheus components are deployed for the application network.  This component also hosts the application network console, accessible by the owner of the application network for the purpose of monitoring and managing the network.

### Interior Site Agent
Location: Interior Site

This agent runs alongside the interior data-plane router and communicates with the central Interior BackBone Management component.  The agent manages the configuration of its router for the purposes of central orchestration of the network.

### Application Network Site Agent
Location: Application Network Site

This agent handles all of the site-specific tasks for an application network.  It communicates with the Application Network Management component for the purposes of orchestrating the application.  This component monitors and configures the local environment.  It also hosts the site console that can be used by application network participants to monitor and control their little slice of the application.

### Data-Plane Components
Locations: Interior Sites and Application Network Sites

The data-plane is implemented using Skupper routers.  The routers run in interior mode for interior sites and edge mode for application network sites.
