// Centralized API endpoint constants
export const ENDPOINTS = {
  // Auth
  AUTH: {
    REGISTER: '/auth/register',
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
    FORGOT_PASSWORD: '/auth/forgot-password',
    RESET_PASSWORD: '/auth/reset-password',
    CHANGE_PASSWORD: '/auth/change-password',
    SEND_OTP: '/auth/send-otp',
    VERIFY_OTP: '/auth/verify-otp',
    ME: '/auth/me',
  },
  // Users
  USERS: {
    ME: '/users/me',
    ME_PROFILE: '/users/me/profile',
    SEARCH: '/users/search',
    BY_ID: (id: string) => `/users/${id}`,
    ORGS: (id: string) => `/users/${id}/organizations`,
  },
  // Organizations
  ORGANIZATIONS: {
    MY: '/organizations/my',
    CREATE: '/organizations',
    BY_ID: (id: string) => `/organizations/${id}`,
    MEMBERS: (orgId: string) => `/organizations/${orgId}/members`,
    MEMBER_ROLE: (orgId: string, userId: string) => `/organizations/${orgId}/members/${userId}/role`,
    REMOVE_MEMBER: (orgId: string, userId: string) => `/organizations/${orgId}/members/${userId}`,
    INVITATIONS: (orgId: string) => `/organizations/${orgId}/invitations`,
    REVOKE_INVITATION: (orgId: string, invId: string) => `/organizations/${orgId}/invitations/${invId}`,
    ACCEPT_INVITATION: '/invitations/accept',
    MY_INVITATIONS: '/invitations/my',
    ACCEPT_BY_ID: (id: string) => `/invitations/${id}/accept`,
    ACTIVITIES: (orgId: string) => `/organizations/${orgId}/activities`,
    REPORTS_OVERVIEW: (orgId: string) => `/organizations/${orgId}/reports/overview`,
    ALL_TASKS: (orgId: string) => `/organizations/${orgId}/tasks`,
    ALL_ISSUES: (orgId: string) => `/organizations/${orgId}/issues`,
    ALL_MILESTONES: (orgId: string) => `/organizations/${orgId}/milestones`,
    ALL_MODULES: (orgId: string) => `/organizations/${orgId}/hardware-modules`,
    ALL_MEETINGS: (orgId: string) => `/organizations/${orgId}/meetings`,
    MEETING: (orgId: string, meetingId: string) => `/organizations/${orgId}/meetings/${meetingId}`,
    DASHBOARD: (orgId: string) => `/organizations/${orgId}/dashboard`,
    LOGO: (orgId: string) => `/organizations/${orgId}/logo`,
  },
  // Projects
  PROJECTS: {
    LIST: (orgId: string) => `/organizations/${orgId}/projects`,
    CREATE: (orgId: string) => `/organizations/${orgId}/projects`,
    BY_ID: (id: string) => `/projects/${id}`,
    UPDATE: (id: string) => `/projects/${id}`,
    DELETE: (id: string) => `/projects/${id}`,
    STAGE: (id: string) => `/projects/${id}/stage`,
    PROGRESS: (id: string) => `/projects/${id}/progress`,
    PIN: (id: string) => `/projects/${id}/pin`,
    LOGO: (id: string) => `/projects/${id}/logo`,
    MEMBERS: (id: string) => `/projects/${id}/members`,
    MEMBER: (projectId: string, userId: string) => `/projects/${projectId}/members/${userId}`,
    MEMBER_ROLE: (projectId: string, userId: string) => `/projects/${projectId}/members/${userId}/role`,
    CHAT: (id: string) => `/projects/${id}/chat`,
    TEAM: (id: string) => `/projects/${id}/team`,
    LINKS: (id: string) => `/projects/${id}/links`,
    ACTIVITIES: (id: string) => `/projects/${id}/activities`,
    REPORTS_OVERVIEW: (id: string) => `/projects/${id}/reports/overview`,
    REPORTS_VELOCITY: (id: string) => `/projects/${id}/reports/velocity`,
    REPORTS_TASK_DISTRIBUTION: (id: string) => `/projects/${id}/reports/task-distribution`,
    REPORTS_TEAM_WORKLOAD: (id: string) => `/projects/${id}/reports/team-workload`,
    REPORTS_BURNDOWN: (id: string) => `/projects/${id}/reports/burndown`,
    REPORTS_BOM_COST_TREND: (id: string) => `/projects/${id}/reports/bom-cost-trend`,
  },
  // Tasks
  TASKS: {
    LIST: (projectId: string) => `/projects/${projectId}/tasks`,
    CREATE: (projectId: string) => `/projects/${projectId}/tasks`,
    BY_ID: (id: string) => `/tasks/${id}`,
    STATUS: (id: string) => `/tasks/${id}/status`,
    ASSIGNEES: (id: string) => `/tasks/${id}/assignees`,
    ASSIGNEE: (taskId: string, userId: string) => `/tasks/${taskId}/assignees/${userId}`,
    MODULES: (id: string) => `/tasks/${id}/modules`,
    MODULE: (taskId: string, moduleId: string) => `/tasks/${taskId}/modules/${moduleId}`,
    DEPENDENCIES: (id: string) => `/tasks/${id}/dependencies`,
    DEPENDENCY: (taskId: string, depId: string) => `/tasks/${taskId}/dependencies/${depId}`,
    COMMENTS: (id: string) => `/tasks/${id}/comments`,
    ME_ALL: '/tasks/me/all',
    /** Personal "My Tasks" item — no project. */
    CREATE_PERSONAL: '/tasks',
  },
  // Task Import (file upload -> AI structuring -> chat resolve -> bulk create)
  TASK_IMPORTS: {
    START: (projectId: string) => `/projects/${projectId}/task-imports`,
    STATUS: (projectId: string, jobId: string) => `/projects/${projectId}/task-imports/${jobId}`,
    CONVERSATION: (projectId: string, jobId: string) => `/projects/${projectId}/task-imports/${jobId}/conversation`,
    MESSAGES: (projectId: string, jobId: string) => `/projects/${projectId}/task-imports/${jobId}/messages`,
    MESSAGE_ATTACHMENTS: (projectId: string, jobId: string) =>
      `/projects/${projectId}/task-imports/${jobId}/messages/attachments`,
    COMMIT: (projectId: string, jobId: string) => `/projects/${projectId}/task-imports/${jobId}/commit`,
  },
  // Issue Import (file upload -> AI structuring -> chat resolve -> bulk create)
  ISSUE_IMPORTS: {
    START: (projectId: string) => `/projects/${projectId}/issue-imports`,
    STATUS: (projectId: string, jobId: string) => `/projects/${projectId}/issue-imports/${jobId}`,
    CONVERSATION: (projectId: string, jobId: string) => `/projects/${projectId}/issue-imports/${jobId}/conversation`,
    MESSAGES: (projectId: string, jobId: string) => `/projects/${projectId}/issue-imports/${jobId}/messages`,
    MESSAGE_ATTACHMENTS: (projectId: string, jobId: string) =>
      `/projects/${projectId}/issue-imports/${jobId}/messages/attachments`,
    COMMIT: (projectId: string, jobId: string) => `/projects/${projectId}/issue-imports/${jobId}/commit`,
  },
  // BOM Import (file upload -> AI structuring -> chat resolve -> bulk create)
  BOM_IMPORTS: {
    START: (projectId: string) => `/projects/${projectId}/bom-imports`,
    STATUS: (projectId: string, jobId: string) => `/projects/${projectId}/bom-imports/${jobId}`,
    CONVERSATION: (projectId: string, jobId: string) => `/projects/${projectId}/bom-imports/${jobId}/conversation`,
    MESSAGES: (projectId: string, jobId: string) => `/projects/${projectId}/bom-imports/${jobId}/messages`,
    MESSAGE_ATTACHMENTS: (projectId: string, jobId: string) =>
      `/projects/${projectId}/bom-imports/${jobId}/messages/attachments`,
    COMMIT: (projectId: string, jobId: string) => `/projects/${projectId}/bom-imports/${jobId}/commit`,
  },
  // ECO Import (file upload -> AI structuring -> chat resolve -> bulk create)
  ECO_IMPORTS: {
    START: (projectId: string) => `/projects/${projectId}/eco-imports`,
    STATUS: (projectId: string, jobId: string) => `/projects/${projectId}/eco-imports/${jobId}`,
    CONVERSATION: (projectId: string, jobId: string) => `/projects/${projectId}/eco-imports/${jobId}/conversation`,
    MESSAGES: (projectId: string, jobId: string) => `/projects/${projectId}/eco-imports/${jobId}/messages`,
    MESSAGE_ATTACHMENTS: (projectId: string, jobId: string) =>
      `/projects/${projectId}/eco-imports/${jobId}/messages/attachments`,
    COMMIT: (projectId: string, jobId: string) => `/projects/${projectId}/eco-imports/${jobId}/commit`,
  },
  // Hardware Modules
  MODULES: {
    LIST: (projectId: string) => `/projects/${projectId}/hardware-modules`,
    CREATE: (projectId: string) => `/projects/${projectId}/hardware-modules`,
    BY_ID: (id: string) => `/hardware-modules/${id}`,
  },
  // Milestones
  MILESTONES: {
    LIST: (projectId: string) => `/projects/${projectId}/milestones`,
    CREATE: (projectId: string) => `/projects/${projectId}/milestones`,
    BY_ID: (id: string) => `/milestones/${id}`,
    COMPLETE: (id: string) => `/milestones/${id}/complete`,
    TASKS: (id: string) => `/milestones/${id}/tasks`,
    TASK: (milestoneId: string, taskId: string) => `/milestones/${milestoneId}/tasks/${taskId}`,
    GENERATE_TASKS: (id: string) => `/milestones/${id}/generate-tasks`,
  },
  // Task Columns
  TASK_COLUMNS: {
    LIST: (projectId: string) => `/projects/${projectId}/task-columns`,
    CREATE: (projectId: string) => `/projects/${projectId}/task-columns`,
    REORDER: (projectId: string) => `/projects/${projectId}/task-columns/reorder`,
    BY_ID: (id: string) => `/task-columns/${id}`,
  },
  // Issue Columns
  ISSUE_COLUMNS: {
    LIST: (projectId: string) => `/projects/${projectId}/issue-columns`,
    CREATE: (projectId: string) => `/projects/${projectId}/issue-columns`,
    REORDER: (projectId: string) => `/projects/${projectId}/issue-columns/reorder`,
    BY_ID: (id: string) => `/issue-columns/${id}`,
  },
  // Tags (shared project-wide registry — reused by issues, tasks, and any future entity)
  TAGS: {
    LIST: (projectId: string) => `/projects/${projectId}/tags`,
    CREATE: (projectId: string) => `/projects/${projectId}/tags`,
    BY_ID: (id: string) => `/tags/${id}`,
  },
  // Issues
  ISSUES: {
    LIST: (projectId: string) => `/projects/${projectId}/issues`,
    LIST_ALL: (projectId: string) => `/projects/${projectId}/issues/all`,
    MY_ALL: '/issues/me/all',
    CREATE: (projectId: string) => `/projects/${projectId}/issues`,
    BY_ID: (id: string) => `/issues/${id}`,
    STATUS: (id: string) => `/issues/${id}/status`,
    ASSIGNEES: (id: string) => `/issues/${id}/assignees`,
    ASSIGNEE: (issueId: string, userId: string) => `/issues/${issueId}/assignees/${userId}`,
    TASK_LINKS: (id: string) => `/issues/${id}/task-links`,
    TASK_LINK: (issueId: string, taskId: string) => `/issues/${issueId}/task-links/${taskId}`,
    COMMENTS: (id: string) => `/issues/${id}/comments`,
  },
  // Customer-support intake API keys (management — authenticated)
  SUPPORT_LINKS: {
    LIST:       (projectId: string) => `/projects/${projectId}/support-links`,
    CREATE:     (projectId: string) => `/projects/${projectId}/support-links`,
    BY_ID:      (projectId: string, linkId: string) => `/projects/${projectId}/support-links/${linkId}`,
    REGENERATE: (projectId: string, linkId: string) => `/projects/${projectId}/support-links/${linkId}/regenerate`,
  },
  // BOM
  BOM: {
    TREE:              (projectId: string) => `/projects/${projectId}/bom/tree`,
    NODES:             (projectId: string) => `/projects/${projectId}/bom/nodes`,
    SUMMARY:           (projectId: string) => `/projects/${projectId}/bom/summary`,
    EXPORT:            (projectId: string) => `/projects/${projectId}/bom/export`,
    NODE:              (nodeId: string) => `/bom/nodes/${nodeId}`,
    NODE_MOVE:         (nodeId: string) => `/bom/nodes/${nodeId}/parent`,
    NODE_REQUIREMENTS: (nodeId: string) => `/bom/nodes/${nodeId}/requirements`,
    REQ_LINK:          (linkId: string) => `/bom/requirement-links/${linkId}`,
    NODE_APPROVALS:    (nodeId: string) => `/bom/nodes/${nodeId}/approvals`,
    APPROVAL_REQUESTS:        (nodeId: string) => `/bom/nodes/${nodeId}/approval-requests`,
    APPROVAL_REQUEST_DECISION:(requestId: string) => `/bom/approval-requests/${requestId}/decision`,
    PROJECT_APPROVAL_REQUESTS:(projectId: string) => `/projects/${projectId}/bom/approval-requests`,
    NODE_NOTES:        (nodeId: string) => `/bom/nodes/${nodeId}/notes`,
    REQUIREMENT_ALLOCATIONS: (projectId: string) => `/projects/${projectId}/bom/requirement-allocations`,
  },
  // BOM import — AI-assisted column mapping fallback for Excel import
  BOM_IMPORT: {
    MAP_COLUMNS: () => `/bom/import/map-columns`,
    FIX_ROW:     () => `/bom/import/fix-row`,
  },
  // Parts catalog (org-scoped)
  PARTS: {
    LIST:      (orgId: string)  => `/organizations/${orgId}/parts`,
    CREATE:    (orgId: string)  => `/organizations/${orgId}/parts`,
    CHECK:     (orgId: string)  => `/organizations/${orgId}/parts/check`,
    BY_ID:     (partId: string) => `/parts/${partId}`,
    REVISIONS: (partId: string) => `/parts/${partId}/revisions`,
    WHERE_USED:(partId: string) => `/parts/${partId}/where-used`,
  },
  // Notifications
  NOTIFICATIONS: {
    LIST: '/notifications',
    COUNT: '/notifications/count',
    STATS: '/notifications/stats',
    READ_ALL: '/notifications/read-all',
    READ: (id: string) => `/notifications/${id}/read`,
    DELETE: (id: string) => `/notifications/${id}`,
    CLEAR_READ: '/notifications/read',
    PREFERENCES: '/notification-preferences',
  },
  // Web push subscriptions
  PUSH: {
    SUBSCRIBE: '/push-subscriptions',
    UNSUBSCRIBE: '/push-subscriptions',
  },
  // Per-user opt-in feature toggles (Integrations page "Features" cards)
  FEATURE_TOGGLES: '/feature-toggles',
  // Comments
  COMMENTS: {
    UPDATE: (id: string) => `/comments/${id}`,
    DELETE: (id: string) => `/comments/${id}`,
  },
  // Chat messages (single-message operations, not nested under a conversation)
  MESSAGES: {
    DELETE: (messageId: string) => `/messages/${messageId}`,
    DELETE_FOR_ME: (messageId: string) => `/messages/${messageId}/for-me`,
    UPDATE: (messageId: string) => `/messages/${messageId}`,
  },
  // Message reactions
  REACTIONS: {
    TOGGLE: (messageId: string) => `/messages/${messageId}/reactions`,
    BULK: '/messages/reactions',
  },
  // Pinned / favourite messages
  PINS: {
    TOGGLE: (conversationId: string, messageId: string) => `/conversations/${conversationId}/messages/${messageId}/pin`,
    LIST: (conversationId: string) => `/conversations/${conversationId}/pins`,
  },
  FAVOURITES: {
    TOGGLE: (messageId: string) => `/messages/${messageId}/favourite`,
    LIST: (conversationId: string) => `/conversations/${conversationId}/favourites`,
    LIST_ALL: '/favourites',
  },
  // Chat / Conversations
  CONVERSATIONS: {
    LIST: '/conversations',
    CREATE: '/conversations',
    BY_ID: (id: string) => `/conversations/${id}`,
    MESSAGES: (id: string) => `/conversations/${id}/messages`,
    FILE_MESSAGE: (id: string) => `/conversations/${id}/messages/file`,
    READ: (id: string) => `/conversations/${id}/read`,
    NOTIFICATIONS: (id: string) => `/conversations/${id}/notifications`,
    MEMBERS: (id: string) => `/conversations/${id}/members`,
    MEMBER: (conversationId: string, userId: string) => `/conversations/${conversationId}/members/${userId}`,
    FILES: (id: string) => `/conversations/${id}/files`,
    MUTUAL_PROJECTS: (id: string) => `/conversations/${id}/mutual-projects`,
    FAVOURITE_TOGGLE: (id: string) => `/conversations/${id}/favourite`,
    HIDE: (id: string) => `/conversations/${id}/hide`,
  },
  // Requirement groups (project-scoped taxonomy)
  REQUIREMENT_GROUPS: {
    LIST:   (projectId: string) => `/projects/${projectId}/requirement-groups`,
    CREATE: (projectId: string) => `/projects/${projectId}/requirement-groups`,
    UPDATE: (groupId: string) => `/requirement-groups/${groupId}`,
    DELETE: (groupId: string) => `/requirement-groups/${groupId}`,
  },
  // Requirements
  REQUIREMENTS: {
    TREE:   (projectId: string) => `/projects/${projectId}/requirements`,
    CREATE: (projectId: string) => `/projects/${projectId}/requirements`,
    BY_ID:  (requirementId: string) => `/requirements/${requirementId}`,
    UPDATE: (requirementId: string) => `/requirements/${requirementId}`,
    DELETE: (requirementId: string) => `/requirements/${requirementId}`,
    LINKS:  (requirementId: string) => `/requirements/${requirementId}/links`,
    COMMENTS: (requirementId: string) => `/requirements/${requirementId}/comments`,
  },
  // Requirement links (requirement <-> requirement graph edges)
  REQUIREMENT_LINKS: {
    PROJECT_LIST: (projectId: string) => `/projects/${projectId}/requirement-links`,
    UPDATE: (linkId: string) => `/requirement-links/${linkId}`,
    DELETE: (linkId: string) => `/requirement-links/${linkId}`,
  },
  // Test & Verification
  VERIFICATION: {
    SUMMARY:          (projectId: string) => `/projects/${projectId}/verification-summary`,
    BY_REQUIREMENT:   (requirementId: string) => `/requirements/${requirementId}/verification`,
    CREATE_TEST_CASE: (requirementId: string) => `/requirements/${requirementId}/test-cases`,
    CONFIRM_VERIFIED: (requirementId: string) => `/requirements/${requirementId}/confirm-verified`,
    UPDATE_TEST_CASE: (testCaseId: string) => `/test-cases/${testCaseId}`,
    DELETE_TEST_CASE: (testCaseId: string) => `/test-cases/${testCaseId}`,
    EXECUTIONS:       (testCaseId: string) => `/test-cases/${testCaseId}/executions`,
    RECORD_EXECUTION: (testCaseId: string) => `/test-cases/${testCaseId}/executions`,
    MODE:             (projectId: string) => `/projects/${projectId}/verification-mode`,
    PIPELINE_TEMPLATE:(projectId: string) => `/projects/${projectId}/verification-pipeline-template`,
    SUBMIT_FOR_VERIFICATION: (requirementId: string) => `/requirements/${requirementId}/submit-for-verification`,
    PIPELINE_STEP_DECISION:  (stepId: string) => `/requirement-pipeline-steps/${stepId}/decision`,
  },
  // Engineering Changes (ECO)
  ECOS: {
    LIST:     (projectId: string) => `/projects/${projectId}/ecos`,
    BY_PART:  (projectId: string, partId: string) => `/projects/${projectId}/ecos/by-part/${partId}`,
    AFFECTED_REQUIREMENTS: (projectId: string) => `/projects/${projectId}/ecos/affected-requirements`,
    STATS:    (projectId: string) => `/projects/${projectId}/ecos/stats`,
    CREATE:   (projectId: string) => `/projects/${projectId}/ecos`,
    BY_ID:    (projectId: string, ecoId: string) => `/projects/${projectId}/ecos/${ecoId}`,
    UPDATE:   (projectId: string, ecoId: string) => `/projects/${projectId}/ecos/${ecoId}`,
    DELETE:   (projectId: string, ecoId: string) => `/projects/${projectId}/ecos/${ecoId}`,
    SUBMIT:   (projectId: string, ecoId: string) => `/projects/${projectId}/ecos/${ecoId}/submit`,
    DECISION: (projectId: string, ecoId: string) => `/projects/${projectId}/ecos/${ecoId}/decision`,
    RELEASE:  (projectId: string, ecoId: string) => `/projects/${projectId}/ecos/${ecoId}/release`,
    VERIFY:   (projectId: string, ecoId: string) => `/projects/${projectId}/ecos/${ecoId}/verify`,
    CLOSE:    (projectId: string, ecoId: string) => `/projects/${projectId}/ecos/${ecoId}/close`,
    HOLD:     (projectId: string, ecoId: string) => `/projects/${projectId}/ecos/${ecoId}/hold`,
    RESUME:   (projectId: string, ecoId: string) => `/projects/${projectId}/ecos/${ecoId}/resume`,
    ECN:      (projectId: string, ecoId: string) => `/projects/${projectId}/ecos/${ecoId}/ecn`,
    ECN_PDF:  (projectId: string, ecoId: string) => `/projects/${projectId}/ecos/${ecoId}/ecn/pdf`,
  },
  // Links
  LINKS: {
    UPDATE: (id: string) => `/links/${id}`,
    DELETE: (id: string) => `/links/${id}`,
  },
  // Google Meet integration
  GOOGLE_MEET: {
    CONNECT: '/integrations/google-meet/connect',
    DISCONNECT: '/integrations/google-meet/disconnect',
    STATUS: (userIds: string[]) => `/integrations/google-meet/status?userIds=${userIds.join(',')}`,
    ACCESS_TOKEN: '/integrations/google-meet/access-token',
  },
  // Google Drive integration (org-level — connecting switches storage for
  // project-level file uploads from S3 to the org's own Drive)
  GOOGLE_DRIVE: {
    CONNECT: (orgId: string) => `/organizations/${orgId}/integrations/google-drive/connect`,
    DISCONNECT: (orgId: string) => `/organizations/${orgId}/integrations/google-drive/disconnect`,
    STATUS: (orgId: string) => `/organizations/${orgId}/integrations/google-drive/status`,
  },
  // Google Sheets integration (BOM sync, see GOOGLE_SHEETS_BOM_INTEGRATION.md).
  // Connects once per org — exactly like Drive above — from Integrations;
  // each project then just links a spreadsheet, reusing that org's connection.
  GOOGLE_SHEETS: {
    CONNECT: (orgId: string) => `/organizations/${orgId}/integrations/google-sheets/connect`,
    DISCONNECT: (orgId: string) => `/organizations/${orgId}/integrations/google-sheets/disconnect`,
    ORG_STATUS: (orgId: string) => `/organizations/${orgId}/integrations/google-sheets/status`,
    LINK_STATUS: (projectId: string) => `/projects/${projectId}/integrations/google-sheets/link-status`,
    TABS: (projectId: string) => `/projects/${projectId}/integrations/google-sheets/tabs`,
    LINK: (projectId: string) => `/projects/${projectId}/integrations/google-sheets/link`,
    UNLINK: (projectId: string) => `/projects/${projectId}/integrations/google-sheets/unlink`,
    COLUMN_MAPPING: (projectId: string) => `/projects/${projectId}/integrations/google-sheets/column-mapping`,
    EXPORT_PREVIEW: (projectId: string) => `/projects/${projectId}/integrations/google-sheets/export-preview`,
    EXPORT_COMMIT: (projectId: string) => `/projects/${projectId}/integrations/google-sheets/export-commit`,
    IMPORT_PREVIEW: (projectId: string) => `/projects/${projectId}/integrations/google-sheets/import-preview`,
    IMPORT_COMMIT: (projectId: string) => `/projects/${projectId}/integrations/google-sheets/import-commit`,
  },
  // AI Assistant (Ask — read-only, Phase 1). Deliberately separate from the
  // /conversations/* namespace above, which is the team-chat feature.
  AI_CONVERSATIONS: {
    LIST: '/ai/conversations',
    CREATE: '/ai/conversations',
    DELETE_ALL: '/ai/conversations',
    BY_ID: (id: string) => `/ai/conversations/${id}`,
    MESSAGES: (id: string) => `/ai/conversations/${id}/messages`,
    EDIT_MESSAGE: (id: string, messageId: string) => `/ai/conversations/${id}/messages/${messageId}`,
    ANSWER: (id: string) => `/ai/conversations/${id}/answer`,
    STOP: (id: string) => `/ai/conversations/${id}/stop`,
    UPLOAD_ATTACHMENT: '/ai/conversations/attachments',
    SHARE: (id: string) => `/ai/conversations/${id}/share`,
    SHARED: (shareId: string) => `/ai/conversations/shared/${shareId}`,
  },
  // Inventory
  INVENTORY: {
    STOCK:        (orgId: string) => `/organizations/${orgId}/inventory/stock`,
    ORDERS:       (orgId: string) => `/organizations/${orgId}/inventory/orders`,
    TRANSACTIONS: (orgId: string) => `/organizations/${orgId}/inventory/transactions`,
    BUILDS:       (orgId: string) => `/organizations/${orgId}/inventory/builds`,
    BUILD_BOM_LINES: (orgId: string, buildId: string) => `/organizations/${orgId}/inventory/builds/${buildId}/bom-lines`,
    BUILDS_CREATE:      (projectId: string) => `/projects/${projectId}/inventory/builds`,
    BUILDS_UPDATE:      (projectId: string, buildId: string) => `/projects/${projectId}/inventory/builds/${buildId}`,
    RECEIVE:            (orgId: string) => `/organizations/${orgId}/inventory/stock/receive`,
    ADJUST:             (orgId: string) => `/organizations/${orgId}/inventory/stock/adjust`,
    ISSUE:              (orgId: string) => `/organizations/${orgId}/inventory/stock/issue`,
    TRANSFER:           (orgId: string) => `/organizations/${orgId}/inventory/stock/transfer`,
    ALLOCATE_STOCK:     (orgId: string, stockId: string) => `/organizations/${orgId}/inventory/stock/${stockId}/allocate`,
    RELEASE_QUARANTINE: (orgId: string, stockId: string) => `/organizations/${orgId}/inventory/stock/${stockId}/release-quarantine`,
    PLACE_ORDER:        (orgId: string) => `/organizations/${orgId}/inventory/orders`,
    MARK_ORDER_ORDERED: (orgId: string, orderId: string) => `/organizations/${orgId}/inventory/orders/${orderId}/mark-ordered`,
    ALLOCATE_BUILD:     (orgId: string, buildId: string) => `/organizations/${orgId}/inventory/builds/${buildId}/allocate`,
    KIT_BUILD:          (orgId: string, buildId: string) => `/organizations/${orgId}/inventory/builds/${buildId}/kit`,
    GENERATE_SHORTAGE_ORDERS: (orgId: string, buildId: string) => `/organizations/${orgId}/inventory/builds/${buildId}/generate-shortage-orders`,
  },
  // Locations (org-wide Warehouse -> Shelf -> Box hierarchy — backs the inventory Location picker)
  LOCATIONS: {
    LIST:   (orgId: string) => `/organizations/${orgId}/locations`,
    CREATE: (orgId: string) => `/organizations/${orgId}/locations`,
    UPDATE: (orgId: string, locationId: string) => `/organizations/${orgId}/locations/${locationId}`,
    DELETE: (orgId: string, locationId: string) => `/organizations/${orgId}/locations/${locationId}`,
  },
  // Act (phase 2) proposals
  AI_PROPOSALS: {
    CONFIRM: (proposalId: string) => `/ai/proposals/${proposalId}/confirm`,
    REVISE: (proposalId: string) => `/ai/proposals/${proposalId}/revise`,
    REJECT: (proposalId: string) => `/ai/proposals/${proposalId}/reject`,
    BY_ID: (proposalId: string) => `/ai/proposals/${proposalId}`,
    BY_CONVERSATION: (conversationId: string) => `/ai/conversations/${conversationId}/proposals`,
  },
  // Uploads
  UPLOADS: {
    AVATAR: '/uploads/avatar',
    GROUP_AVATAR: '/uploads/group-avatar',
    ATTACHMENTS: '/uploads/attachments',
    ATTACHMENT_LINK: '/uploads/attachments/link',
    ATTACHMENT: (id: string) => `/uploads/attachments/${id}`,
    BY_ENTITY: (entityType: string, entityId: string) => `/uploads/attachments/${entityType}/${entityId}`,
  },
};
