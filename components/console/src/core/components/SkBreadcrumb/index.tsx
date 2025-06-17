import { Breadcrumb, BreadcrumbHeading, BreadcrumbItem } from '@patternfly/react-core';
import { Link, useLocation, useSearchParams } from 'react-router-dom';

import { getIdAndNameFromUrlParams } from '../../utils/getIdAndNameFromUrlParams';

const SkBreadcrumb = function () {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();

  const paths = pathname.split('/').filter(Boolean);
  const pathsNormalized = paths.map((path) => getIdAndNameFromUrlParams(path.replace(/%20/g, ' '))); //sanitize %20 url space
  const lastPath = pathsNormalized.pop();

  if (paths.length < 2) {
    return null;
  }

  const queryParams = searchParams.size > 0 ? `?${searchParams.toString()}` : '';

  // Dynamically capitalize and format segment names from URL
  // Automatically handles both section names and detail pages with nome@id format
  const formatDisplayName = (segment: string) =>
    // Capitalize first letter and replace common abbreviations
    segment
      .split(/[-_]/) // Split on hyphens and underscores
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

  return (
    <Breadcrumb>
      {pathsNormalized.map((path, index) => {
        const displayName = formatDisplayName(path.name);

        return (
          <BreadcrumbItem key={path.name} style={{ textTransform: 'capitalize' }}>
            <Link to={`/${[...paths].slice(0, index + 1).join('/')}${queryParams}`}>{displayName}</Link>
          </BreadcrumbItem>
        );
      })}

      <BreadcrumbHeading> &nbsp; {lastPath?.name}</BreadcrumbHeading>
    </Breadcrumb>
  );
};

export default SkBreadcrumb;
