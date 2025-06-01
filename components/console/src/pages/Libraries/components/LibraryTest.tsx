import { useState, useCallback } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Form,
  FormGroup,
  TextArea,
  Stack,
  StackItem,
  Alert,
  ActionGroup,
  CodeBlock,
  CodeBlockCode,
  Split,
  SplitItem,
  Badge,
  Grid,
  GridItem,
  TextInput
} from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import {
  FlaskIcon,
  PlayIcon,
  InfoCircleIcon,
  AngleDownIcon,
  AngleRightIcon,
  PlusIcon,
  TrashIcon,
  EditIcon
} from '@patternfly/react-icons';

interface TestResult {
  success: boolean;
  message: string;
  output?: string;
  errors?: string[];
  warnings?: string[];
}

interface TestCase {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  category: string;
  priority: 'low' | 'medium' | 'high';
  configuration: string;
  lastRun?: Date;
  duration?: number;
  result?: TestResult;
}

interface ExpandedRow {
  [key: string]: boolean;
}

interface LibraryTestProps {
  bodyStyle: 'simple' | 'composite';
}

const LibraryTest = ({ bodyStyle }: LibraryTestProps) => {
  const [validationError, setValidationError] = useState<string>('');
  const [expandedRows, setExpandedRows] = useState<ExpandedRow>({});
  const [editingTest, setEditingTest] = useState<string | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [formData, setFormData] = useState<TestCase>({
    id: '',
    name: '',
    description: '',
    status: 'pending',
    category: 'functional',
    priority: 'medium',
    configuration: ''
  });

  // Mock test cases data
  const [testCases, setTestCases] = useState<TestCase[]>([
    {
      id: '1',
      name: 'Basic Functionality Test',
      description: 'Test the core functionality of the composite block',
      status: 'passed',
      category: 'functional',
      priority: 'high',
      configuration: `# Test Configuration for Basic Functionality
test:
  name: "Basic Functionality Test"
  description: "Test the core functionality of the composite block"
  inputs:
    data:
      message: "Hello, World!"
      count: 5
  expected:
    status: "success"
    processed: true`,
      lastRun: new Date('2024-01-15T10:30:00'),
      duration: 1200
    },
    {
      id: '2',
      name: 'Error Handling Test',
      description: 'Verify proper error handling and recovery mechanisms',
      status: 'failed',
      category: 'resilience',
      priority: 'high',
      configuration: `# Test Configuration for Error Handling
test:
  name: "Error Handling Test"
  description: "Test error scenarios and recovery"
  inputs:
    data:
      invalid_input: true
  expected:
    status: "error"
    error_code: "INVALID_INPUT"`,
      lastRun: new Date('2024-01-14T15:45:00'),
      duration: 2300
    },
    {
      id: '3',
      name: 'Performance Benchmark',
      description: 'Measure performance under typical load conditions',
      status: 'pending',
      category: 'performance',
      priority: 'medium',
      configuration: `# Test Configuration for Performance
test:
  name: "Performance Benchmark"
  description: "Test performance under load"
  inputs:
    load:
      concurrent_requests: 100
      duration: "5m"
  expected:
    avg_response_time: "<200ms"
    success_rate: ">99%"`,
      lastRun: undefined,
      duration: undefined
    }
  ]);

  const categories = ['functional', 'performance', 'resilience', 'integration'];
  const priorities = ['low', 'medium', 'high'];

  // Toggle row expansion
  const toggleRow = useCallback((testId: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [testId]: !prev[testId]
    }));
  }, []);

  // Start adding new test
  const startAdd = useCallback(() => {
    setIsAddingNew(true);
    setFormData({
      id: '',
      name: '',
      description: '',
      status: 'pending',
      category: 'functional',
      priority: 'medium',
      configuration: ''
    });
  }, []);

  // Start editing test
  const startEdit = useCallback((testCase: TestCase) => {
    setEditingTest(testCase.id);
    setFormData({ ...testCase });
  }, []);

  // Cancel add/edit
  const cancelEdit = useCallback(() => {
    setEditingTest(null);
    setIsAddingNew(false);
    setValidationError('');
  }, []);

  // Handle form field changes
  const handleFieldChange = useCallback((field: keyof TestCase, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value
    }));
  }, []);

  // Save test case
  const saveTestCase = useCallback(() => {
    if (!formData.name.trim() || !formData.description.trim()) {
      setValidationError('Name and description are required');
      return;
    }

    if (isAddingNew) {
      const newTest: TestCase = {
        ...formData,
        id: Date.now().toString(),
        status: 'pending'
      };
      setTestCases((prev) => [...prev, newTest]);
    } else {
      setTestCases((prev) => prev.map((test) => (test.id === editingTest ? formData : test)));
    }

    setIsAddingNew(false);
    setEditingTest(null);
    setValidationError('');
  }, [formData, isAddingNew, editingTest]);

  // Delete test case
  const deleteTestCase = useCallback((testId: string) => {
    setTestCases((prev) => prev.filter((test) => test.id !== testId));
    setExpandedRows((prev) => {
      const newExpanded = { ...prev };
      delete newExpanded[testId];
      return newExpanded;
    });
  }, []);

  // Run test case
  const runTestCase = useCallback((testCase: TestCase) => {
    setTestCases((prev) =>
      prev.map((test) => (test.id === testCase.id ? { ...test, status: 'running' as const } : test))
    );

    // Simulate test execution
    setTimeout(() => {
      const success = Math.random() > 0.3; // 70% success rate for demo
      setTestCases((prev) =>
        prev.map((test) =>
          test.id === testCase.id
            ? {
                ...test,
                status: success ? ('passed' as const) : ('failed' as const),
                lastRun: new Date(),
                duration: Math.floor(Math.random() * 3000) + 500
              }
            : test
        )
      );
    }, 2000);
  }, []);

  // Get status color for badges
  const getStatusColor = (status: TestCase['status']) => {
    switch (status) {
      case 'passed':
        return '#3e8635';
      case 'failed':
        return '#c9190b';
      case 'running':
        return '#f0ab00';
      default:
        return '#6a6e73';
    }
  };

  // Get priority color for badges
  const getPriorityColor = (priority: TestCase['priority']) => {
    switch (priority) {
      case 'high':
        return '#c9190b';
      case 'medium':
        return '#f0ab00';
      default:
        return '#6a6e73';
    }
  };

  if (bodyStyle !== 'composite') {
    return (
      <Alert variant="info" title="Testing Not Available" isInline>
        Testing functionality is only available for composite blocks. Simple blocks don't require testing as they are
        template-based.
      </Alert>
    );
  }

  return (
    <Stack hasGutter>
      {validationError && (
        <StackItem>
          <Alert variant="danger" title="Test Error" isInline>
            {validationError}
          </Alert>
        </StackItem>
      )}

      <StackItem>
        <Button
          variant="primary"
          icon={<PlusIcon />}
          onClick={startAdd}
          isDisabled={isAddingNew || editingTest !== null}
        >
          Add Test Case
        </Button>
      </StackItem>

      <StackItem>
        <Table aria-label="Test cases table">
          <Thead>
            <Tr>
              <Th width={10}></Th>
              <Th>Name</Th>
              <Th>Category</Th>
              <Th>Priority</Th>
              <Th>Status</Th>
              <Th>Last Run</Th>
              <Th width={10} modifier="fitContent"></Th>
            </Tr>
          </Thead>
          <Tbody>
            {/* Add new test case form */}
            {isAddingNew && (
              <Tr>
                <Td colSpan={7}>
                  <Card>
                    <CardHeader>
                      <CardTitle>Add New Test Case</CardTitle>
                    </CardHeader>
                    <CardBody>
                      <Form>
                        <Grid hasGutter>
                          <GridItem span={6}>
                            <FormGroup label="Name" isRequired>
                              <TextInput
                                value={formData.name}
                                onChange={(_event, value) => handleFieldChange('name', value)}
                                placeholder="Enter test case name"
                              />
                            </FormGroup>
                          </GridItem>

                          <GridItem span={6}>
                            <FormGroup label="Category" isRequired>
                              <select
                                value={formData.category}
                                onChange={(e) => handleFieldChange('category', e.target.value)}
                                style={{ padding: '8px', width: '100%', border: '1px solid #ccc' }}
                              >
                                {categories.map((cat) => (
                                  <option key={cat} value={cat}>
                                    {cat}
                                  </option>
                                ))}
                              </select>
                            </FormGroup>
                          </GridItem>

                          <GridItem span={6}>
                            <FormGroup label="Priority" isRequired>
                              <select
                                value={formData.priority}
                                onChange={(e) => handleFieldChange('priority', e.target.value as any)}
                                style={{ padding: '8px', width: '100%', border: '1px solid #ccc' }}
                              >
                                {priorities.map((pri) => (
                                  <option key={pri} value={pri}>
                                    {pri}
                                  </option>
                                ))}
                              </select>
                            </FormGroup>
                          </GridItem>

                          <GridItem span={12}>
                            <FormGroup label="Description" isRequired>
                              <TextInput
                                value={formData.description}
                                onChange={(_event, value) => handleFieldChange('description', value)}
                                placeholder="Enter test case description"
                              />
                            </FormGroup>
                          </GridItem>

                          <GridItem span={12}>
                            <FormGroup label="Test Configuration">
                              <TextArea
                                value={formData.configuration}
                                onChange={(_event, value) => handleFieldChange('configuration', value)}
                                placeholder="Enter test configuration (YAML format)"
                                rows={8}
                                style={{ fontFamily: 'monospace' }}
                              />
                            </FormGroup>
                          </GridItem>
                        </Grid>

                        <ActionGroup style={{ marginTop: '1rem' }}>
                          <Button variant="primary" onClick={saveTestCase}>
                            Save Test Case
                          </Button>
                          <Button variant="link" onClick={cancelEdit}>
                            Cancel
                          </Button>
                        </ActionGroup>
                      </Form>
                    </CardBody>
                  </Card>
                </Td>
              </Tr>
            )}

            {testCases.map((testCase) => (
              <>
                <Tr key={testCase.id}>
                  <Td>
                    <Button
                      variant="plain"
                      aria-label={`${expandedRows[testCase.id] ? 'Collapse' : 'Expand'} test case ${testCase.name}`}
                      onClick={() => toggleRow(testCase.id)}
                      icon={expandedRows[testCase.id] ? <AngleDownIcon /> : <AngleRightIcon />}
                      isDisabled={isAddingNew || editingTest !== null}
                    />
                  </Td>
                  <Td>{testCase.name}</Td>
                  <Td>
                    <Badge>{testCase.category}</Badge>
                  </Td>
                  <Td>
                    <Badge style={{ backgroundColor: getPriorityColor(testCase.priority), color: 'white' }}>
                      {testCase.priority}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge style={{ backgroundColor: getStatusColor(testCase.status), color: 'white' }}>
                      {testCase.status}
                      {testCase.status === 'running' && '...'}
                    </Badge>
                  </Td>
                  <Td>
                    {testCase.lastRun ? (
                      <div>
                        <div>{testCase.lastRun.toLocaleDateString()}</div>
                        <div style={{ fontSize: '0.8em', color: '#666' }}>
                          {testCase.duration ? `${testCase.duration}ms` : ''}
                        </div>
                      </div>
                    ) : (
                      '-'
                    )}
                  </Td>
                  <Td modifier="fitContent">
                    <Button
                      variant="link"
                      isDanger
                      onClick={() => deleteTestCase(testCase.id)}
                      isDisabled={editingTest !== null || testCase.status === 'running'}
                      icon={<TrashIcon />}
                    >
                      Delete
                    </Button>
                  </Td>
                </Tr>

                {/* Show expanded content when row is expanded */}
                {expandedRows[testCase.id] && !isAddingNew && editingTest !== testCase.id && (
                  <Tr key={`${testCase.id}-expanded`}>
                    <Td colSpan={7}>
                      <Card>
                        <CardHeader>
                          <CardTitle>
                            <Split hasGutter>
                              <SplitItem>
                                <FlaskIcon />
                              </SplitItem>
                              <SplitItem>Test Case Details</SplitItem>
                            </Split>
                          </CardTitle>
                        </CardHeader>
                        <CardBody>
                          <Grid hasGutter>
                            <GridItem span={12}>
                              <FormGroup label="Description">
                                <div>{testCase.description}</div>
                              </FormGroup>
                            </GridItem>

                            <GridItem span={4}>
                              <FormGroup label="Category">
                                <Badge>{testCase.category}</Badge>
                              </FormGroup>
                            </GridItem>

                            <GridItem span={4}>
                              <FormGroup label="Priority">
                                <Badge style={{ backgroundColor: getPriorityColor(testCase.priority), color: 'white' }}>
                                  {testCase.priority}
                                </Badge>
                              </FormGroup>
                            </GridItem>

                            <GridItem span={4}>
                              <FormGroup label="Status">
                                <Badge style={{ backgroundColor: getStatusColor(testCase.status), color: 'white' }}>
                                  {testCase.status}
                                  {testCase.status === 'running' && '...'}
                                </Badge>
                              </FormGroup>
                            </GridItem>

                            {testCase.configuration && (
                              <GridItem span={12}>
                                <FormGroup label="Test Configuration">
                                  <CodeBlock>
                                    <CodeBlockCode>{testCase.configuration}</CodeBlockCode>
                                  </CodeBlock>
                                </FormGroup>
                              </GridItem>
                            )}

                            {testCase.lastRun && (
                              <GridItem span={6}>
                                <FormGroup label="Last Run">
                                  <div>
                                    <div>{testCase.lastRun.toLocaleString()}</div>
                                    {testCase.duration && (
                                      <div style={{ fontSize: '0.9em', color: '#666' }}>
                                        Duration: {testCase.duration}ms
                                      </div>
                                    )}
                                  </div>
                                </FormGroup>
                              </GridItem>
                            )}
                          </Grid>

                          {/* Action buttons for the expanded view */}
                          <ActionGroup style={{ marginTop: '1rem' }}>
                            <Button
                              variant="primary"
                              onClick={() => runTestCase(testCase)}
                              isDisabled={testCase.status === 'running'}
                              icon={<PlayIcon />}
                            >
                              {testCase.status === 'running' ? 'Running...' : 'Run Test'}
                            </Button>
                            <Button variant="secondary" onClick={() => startEdit(testCase)} icon={<EditIcon />}>
                              Edit Test
                            </Button>
                          </ActionGroup>
                        </CardBody>
                      </Card>
                    </Td>
                  </Tr>
                )}

                {/* Edit existing test case */}
                {editingTest === testCase.id && expandedRows[testCase.id] && (
                  <Tr key={`${testCase.id}-edit`}>
                    <Td colSpan={7}>
                      <Card>
                        <CardHeader>
                          <CardTitle>Edit Test Case</CardTitle>
                        </CardHeader>
                        <CardBody>
                          <Form>
                            <Grid hasGutter>
                              <GridItem span={6}>
                                <FormGroup label="Name" isRequired>
                                  <TextInput
                                    value={formData.name}
                                    onChange={(_event, value) => handleFieldChange('name', value)}
                                    placeholder="Enter test case name"
                                  />
                                </FormGroup>
                              </GridItem>

                              <GridItem span={6}>
                                <FormGroup label="Category" isRequired>
                                  <select
                                    value={formData.category}
                                    onChange={(e) => handleFieldChange('category', e.target.value)}
                                    style={{ padding: '8px', width: '100%', border: '1px solid #ccc' }}
                                  >
                                    {categories.map((cat) => (
                                      <option key={cat} value={cat}>
                                        {cat}
                                      </option>
                                    ))}
                                  </select>
                                </FormGroup>
                              </GridItem>

                              <GridItem span={6}>
                                <FormGroup label="Priority" isRequired>
                                  <select
                                    value={formData.priority}
                                    onChange={(e) => handleFieldChange('priority', e.target.value as any)}
                                    style={{ padding: '8px', width: '100%', border: '1px solid #ccc' }}
                                  >
                                    {priorities.map((pri) => (
                                      <option key={pri} value={pri}>
                                        {pri}
                                      </option>
                                    ))}
                                  </select>
                                </FormGroup>
                              </GridItem>

                              <GridItem span={12}>
                                <FormGroup label="Description" isRequired>
                                  <TextInput
                                    value={formData.description}
                                    onChange={(_event, value) => handleFieldChange('description', value)}
                                    placeholder="Enter test case description"
                                  />
                                </FormGroup>
                              </GridItem>

                              <GridItem span={12}>
                                <FormGroup label="Test Configuration">
                                  <TextArea
                                    value={formData.configuration}
                                    onChange={(_event, value) => handleFieldChange('configuration', value)}
                                    placeholder="Enter test configuration (YAML format)"
                                    rows={10}
                                    style={{ fontFamily: 'monospace' }}
                                  />
                                </FormGroup>
                              </GridItem>
                            </Grid>

                            <ActionGroup style={{ marginTop: '1rem' }}>
                              <Button variant="primary" onClick={saveTestCase}>
                                Save Changes
                              </Button>
                              <Button variant="link" onClick={cancelEdit}>
                                Cancel
                              </Button>
                            </ActionGroup>
                          </Form>
                        </CardBody>
                      </Card>
                    </Td>
                  </Tr>
                )}
              </>
            ))}
          </Tbody>
        </Table>
      </StackItem>

      <StackItem>
        <Card>
          <CardHeader>
            <CardTitle>
              <Split hasGutter>
                <SplitItem>
                  <InfoCircleIcon />
                </SplitItem>
                <SplitItem>Testing Guidelines</SplitItem>
              </Split>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <Stack hasGutter>
              <StackItem>
                <p>
                  <strong>Test Categories:</strong>
                </p>
                <ul>
                  <li>
                    <strong>Functional:</strong> Test core functionality and features
                  </li>
                  <li>
                    <strong>Performance:</strong> Measure response times and resource usage
                  </li>
                  <li>
                    <strong>Resilience:</strong> Test error handling and recovery
                  </li>
                  <li>
                    <strong>Integration:</strong> Test interactions with other components
                  </li>
                </ul>
              </StackItem>

              <StackItem>
                <p>
                  <strong>Priority Levels:</strong>
                </p>
                <ul>
                  <li>
                    <strong>High:</strong> Critical tests that must pass
                  </li>
                  <li>
                    <strong>Medium:</strong> Important tests for quality assurance
                  </li>
                  <li>
                    <strong>Low:</strong> Nice-to-have tests for comprehensive coverage
                  </li>
                </ul>
              </StackItem>

              <StackItem>
                <p>
                  <strong>Test Configuration:</strong>
                </p>
                <ul>
                  <li>Use YAML format for test definitions</li>
                  <li>Include input data, expected outputs, and environment settings</li>
                  <li>Specify timeout and retry parameters</li>
                  <li>Add validation rules and constraints</li>
                </ul>
              </StackItem>
            </Stack>
          </CardBody>
        </Card>
      </StackItem>
    </Stack>
  );
};

export default LibraryTest;
