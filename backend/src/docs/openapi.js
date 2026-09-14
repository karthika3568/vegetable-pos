const ref = (name) => ({ $ref: `#/components/schemas/${name}` });

const qs = (name, description, extra = {}) => ({
  name,
  in: 'query',
  description,
  schema: { type: 'string', ...extra },
});

const qi = (name, description, { min = 1, max = null } = {}) => ({
  name,
  in: 'query',
  description,
  schema: { type: 'integer', minimum: min, ...(max ? { maximum: max } : {}) },
});

const qb = (name, description) => ({
  name,
  in: 'query',
  description,
  schema: { type: 'boolean' },
});

const qe = (name, values, description) => ({
  name,
  in: 'query',
  description,
  schema: { type: 'string', enum: values },
});

const pp = (name, description) => ({
  name,
  in: 'path',
  required: true,
  description,
  schema: { type: 'integer', minimum: 1 },
});

const pagination = [
  qi('page', 'Page number (starts at 1)'),
  qi('limit', 'Records per page (1-100)', { min: 1, max: 100 }),
];

const commonParams = [
  ...pagination,
  qe('sortOrder', ['asc', 'desc'], 'Sort direction'),
];

const pagedDataSchema = (itemRef) => ({
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    message: { type: 'string' },
    data: { type: 'array', items: ref(itemRef) },
    meta: ref('PaginationMeta'),
  },
});

const dataSchema = (itemRef, extra = null) => ({
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    message: { type: 'string' },
    data: ref(itemRef),
    ...(extra || {}),
  },
});

const okResponse = (statusCode, description, body) => ({ [statusCode]: { description, ...body } });

const okPaged = (itemRef, description, opts = {}) =>
  okResponse(opts.code || '200', description, {
    content: {
      'application/json': {
        schema: pagedDataSchema(itemRef),
        ...(opts.example ? { example: opts.example } : {}),
      },
    },
  });

const okData = (itemRef, description, extra = null, opts = {}) =>
  okResponse(opts.code || '200', description, {
    content: {
      'application/json': {
        schema: dataSchema(itemRef, extra),
        ...(opts.example ? { example: opts.example } : {}),
      },
    },
  });

const okRawData = (description, schema, opts = {}) =>
  okResponse(opts.code || '200', description, {
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string' },
            data: schema,
          },
        },
        ...(opts.example ? { example: opts.example } : {}),
      },
    },
  });

const errBody = (hasDetails, example = null) => ({
  description: 'Request error envelope',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string' },
          ...(hasDetails
            ? {
                details: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      field: { type: 'string' },
                      message: { type: 'string' },
                    },
                  },
                },
              }
            : {}),
        },
        ...(example ? { example } : {}),
      },
    },
  },
});

const errorResponses = {
  '400': errBody(true, {
    success: false,
    message: 'Validation failed',
    details: [{ field: 'name', message: 'name is required' }],
  }),
  '401': errBody(false, { success: false, message: 'Authentication token missing' }),
  '403': errBody(false, { success: false, message: 'You do not have permission to perform this action' }),
  '404': errBody(false, { success: false, message: 'Resource not found' }),
  '409': errBody(false, { success: false, message: 'Resource already exists' }),
  '500': errBody(false, { success: false, message: 'Internal server error' }),
};

const errorResponsesNo404 = { '400': errBody(true), '401': errBody(false), '403': errBody(false), '409': errBody(false), '500': errBody(false) };

const bodyRef = (name, description, required = true) => ({
  required,
  description,
  content: { 'application/json': { schema: ref(name) } },
});

const authOperations = {
  login: {
    tags: ['Auth'],
    summary: 'Authenticate and receive a bearer token',
    security: [],
    requestBody: bodyRef('LoginRequest', 'Username and password'),
    responses: {
      ...okData('LoginResponseData', 'Successful login', null, {
        example: {
          success: true,
          message: 'Login successful',
          data: {
            token:
              '<your-bearer-token-here>',
            user: {
              id: 1,
              username: 'admin',
              fullName: 'System Administrator',
              roleId: 1,
              roleName: 'admin',
              isAdmin: true,
              permissions: ['products.manage', 'sales.create', 'reports.view'],
            },
          },
        },
      }),
      '400': errBody(true),
      '401': errBody(false),
      '403': errBody(false),
      '500': errBody(false),
    },
  },
  logout: {
    tags: ['Auth'],
    summary: 'Invalidate the caller token',
    responses: {
      ...okRawData('Successful logout', { type: 'object', additionalProperties: true }),
      '401': errBody(false),
      '500': errBody(false),
    },
  },
  me: {
    tags: ['Auth'],
    summary: 'Return the current authenticated user',
    responses: {
      ...okData('User', 'Current user'),
      '401': errBody(false),
      '500': errBody(false),
    },
  },
};

const paths = {
  '/auth/login': { post: authOperations.login },
  '/auth/logout': { post: authOperations.logout },
  '/auth/me': { get: authOperations.me },

  '/users': {
    get: {
      tags: ['Users'],
      summary: 'List users',
      parameters: [
        ...pagination,
        qe('status', ['active', 'inactive', 'suspended'], 'Filter by user status'),
        qi('roleId', 'Filter by role id'),
      ],
      responses: { ...okPaged('User', 'Paginated users'), ...errorResponses },
    },
    post: {
      tags: ['Users'],
      summary: 'Create a user',
      requestBody: bodyRef('CreateUser', 'User details'),
      responses: { ...okData('User', 'Created user', null, { code: '201' }), ...errorResponsesNo404 },
    },
  },

  '/users/{id}': {
    get: {
      tags: ['Users'],
      summary: 'Get a user',
      parameters: [pp('id', 'User id')],
      responses: { ...okData('User', 'User'), ...errorResponses },
    },
    put: {
      tags: ['Users'],
      summary: 'Update a user',
      parameters: [pp('id', 'User id')],
      requestBody: bodyRef('UpdateUser', 'Fields to update'),
      responses: { ...okData('User', 'Updated user'), ...errorResponses },
    },
  },

  '/users/{id}/status': {
    patch: {
      tags: ['Users'],
      summary: 'Set user status (active / inactive / suspended)',
      parameters: [pp('id', 'User id')],
      requestBody: bodyRef('SetUserStatus', 'New status'),
      responses: { ...okData('User', 'Updated user'), ...errorResponses },
    },
  },

  '/users/{id}/permissions': {
    put: {
      tags: ['Users'],
      summary: 'Replace a user permission codes',
      parameters: [pp('id', 'User id')],
      requestBody: bodyRef('SetUserPermissions', 'Permission codes'),
      responses: { ...okData('User', 'Updated user'), ...errorResponses },
    },
  },

  '/users/{id}/logout': {
    post: {
      tags: ['Users'],
      summary: 'Force logout (bump token version) for a user',
      parameters: [pp('id', 'User id')],
      responses: {
        ...okRawData('Successful revocation', { type: 'object', additionalProperties: true }),
        ...errorResponses,
      },
    },
  },

  '/roles': {
    get: {
      tags: ['Roles & Permissions'],
      summary: 'List roles',
      responses: {
        ...okRawData('List of roles', { type: 'array', items: ref('Role') }),
        ...errorResponses,
      },
    },
  },

  '/permissions': {
    get: {
      tags: ['Roles & Permissions'],
      summary: 'List permission codes',
      responses: {
        ...okRawData('List of permissions', { type: 'array', items: ref('Permission') }),
        ...errorResponses,
      },
    },
  },

  '/categories': {
    get: {
      tags: ['Categories'],
      summary: 'List categories',
      parameters: [
        ...pagination,
        qs('search', 'Search by name'),
        qe('status', ['active', 'inactive'], 'Filter by status'),
      ],
      responses: {
        ...okPaged('Category', 'Paginated categories', {
          example: {
            success: true,
            message: 'Success',
            data: [
              {
                id: 1,
                name: 'Vegetables',
                description: 'Fresh produce and greens',
                status: 'active',
                createdAt: '2026-09-10T06:00:00.000Z',
                updatedAt: '2026-09-10T06:00:00.000Z',
              },
            ],
            meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
          },
        }),
        ...errorResponses,
      },
    },
    post: {
      tags: ['Categories'],
      summary: 'Create a category',
      requestBody: bodyRef('CategoryInput', 'Category details (name required)'),
      responses: { ...okData('Category', 'Created category', null, { code: '201' }), ...errorResponsesNo404 },
    },
  },

  '/categories/{id}': {
    get: {
      tags: ['Categories'],
      summary: 'Get a category',
      parameters: [pp('id', 'Category id')],
      responses: { ...okData('Category', 'Category'), ...errorResponses },
    },
    put: {
      tags: ['Categories'],
      summary: 'Update a category',
      parameters: [pp('id', 'Category id')],
      requestBody: bodyRef('CategoryUpdate', 'Category fields'),
      responses: { ...okData('Category', 'Updated category'), ...errorResponses },
    },
  },

  '/categories/{id}/status': {
    patch: {
      tags: ['Categories'],
      summary: 'Set category status',
      parameters: [pp('id', 'Category id')],
      requestBody: bodyRef('SetStatusBody', 'New status'),
      responses: { ...okData('Category', 'Updated category'), ...errorResponses },
    },
  },

  '/products': {
    get: {
      tags: ['Products & Variants'],
      summary: 'List products',
      parameters: [
        ...pagination,
        qs('search', 'Search by name or product code'),
        qe('status', ['active', 'inactive'], 'Filter by status'),
        qi('categoryId', 'Filter by category'),
        qb('lowStockOnly', 'Only products at or below minimum stock'),
      ],
      responses: {
        ...okPaged('Product', 'Paginated products', {
          example: {
            success: true,
            message: 'Success',
            data: [
              {
                id: 1,
                productCode: 'TOM-001',
                name: 'Tomato',
                categoryId: 1,
                categoryName: 'Vegetables',
                unit: 'kg',
                purchasePrice: 20.0,
                sellingPrice: 35.0,
                currentStock: 10.5,
                minimumStock: 5,
                status: 'active',
                createdAt: '2026-09-10T06:00:00.000Z',
                updatedAt: '2026-09-10T06:00:00.000Z',
              },
            ],
            meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
          },
        }),
        ...errorResponses,
      },
    },
    post: {
      tags: ['Products & Variants'],
      summary: 'Create a product',
      requestBody: bodyRef('ProductInput', 'Product details'),
      responses: { ...okData('Product', 'Created product', null, { code: '201' }), ...errorResponsesNo404 },
    },
  },

  '/products/{id}': {
    get: {
      tags: ['Products & Variants'],
      summary: 'Get a product',
      parameters: [pp('id', 'Product id')],
      responses: { ...okData('Product', 'Product'), ...errorResponses },
    },
    put: {
      tags: ['Products & Variants'],
      summary: 'Update a product',
      parameters: [pp('id', 'Product id')],
      requestBody: bodyRef('ProductUpdate', 'Product fields'),
      responses: { ...okData('Product', 'Updated product'), ...errorResponses },
    },
  },

  '/products/{id}/status': {
    patch: {
      tags: ['Products & Variants'],
      summary: 'Set product status',
      parameters: [pp('id', 'Product id')],
      requestBody: bodyRef('SetStatusBody', 'New status'),
      responses: { ...okData('Product', 'Updated product'), ...errorResponses },
    },
  },

  '/products/{productId}/variants': {
    get: {
      tags: ['Products & Variants'],
      summary: 'List variants for a product',
      parameters: [
        pp('productId', 'Product id'),
        ...pagination,
        qs('search', 'Search by variant name'),
        qe('status', ['active', 'inactive'], 'Filter by status'),
      ],
      responses: { ...okPaged('ProductVariant', 'Paginated variants'), ...errorResponses },
    },
    post: {
      tags: ['Products & Variants'],
      summary: 'Create a variant for a product',
      parameters: [pp('productId', 'Product id')],
      requestBody: bodyRef('ProductVariantInput', 'Variant details'),
      responses: { ...okData('ProductVariant', 'Created variant', null, { code: '201' }), ...errorResponsesNo404 },
    },
  },

  '/products/{productId}/variants/{variantId}': {
    get: {
      tags: ['Products & Variants'],
      summary: 'Get a product variant',
      parameters: [pp('productId', 'Product id'), pp('variantId', 'Variant id')],
      responses: { ...okData('ProductVariant', 'Variant'), ...errorResponses },
    },
    put: {
      tags: ['Products & Variants'],
      summary: 'Update a product variant',
      parameters: [pp('productId', 'Product id'), pp('variantId', 'Variant id')],
      requestBody: bodyRef('ProductVariantInput', 'Variant fields'),
      responses: { ...okData('ProductVariant', 'Updated variant'), ...errorResponses },
    },
  },

  '/products/{productId}/variants/{variantId}/status': {
    patch: {
      tags: ['Products & Variants'],
      summary: 'Set variant status',
      parameters: [pp('productId', 'Product id'), pp('variantId', 'Variant id')],
      requestBody: bodyRef('SetStatusBody', 'New status'),
      responses: { ...okData('ProductVariant', 'Updated variant'), ...errorResponses },
    },
  },

  '/suppliers': {
    get: {
      tags: ['Suppliers'],
      summary: 'List suppliers',
      parameters: [
        ...pagination,
        qs('search', 'Search by name'),
        qe('status', ['active', 'inactive'], 'Filter by status'),
      ],
      responses: { ...okPaged('Supplier', 'Paginated suppliers'), ...errorResponses },
    },
    post: {
      tags: ['Suppliers'],
      summary: 'Create a supplier',
      requestBody: bodyRef('SupplierInput', 'Supplier details'),
      responses: { ...okData('Supplier', 'Created supplier', null, { code: '201' }), ...errorResponsesNo404 },
    },
  },

  '/suppliers/{id}': {
    get: {
      tags: ['Suppliers'],
      summary: 'Get a supplier',
      parameters: [pp('id', 'Supplier id')],
      responses: { ...okData('Supplier', 'Supplier'), ...errorResponses },
    },
    put: {
      tags: ['Suppliers'],
      summary: 'Update a supplier',
      parameters: [pp('id', 'Supplier id')],
      requestBody: bodyRef('SupplierUpdate', 'Supplier fields'),
      responses: { ...okData('Supplier', 'Updated supplier'), ...errorResponses },
    },
  },

  '/suppliers/{id}/status': {
    patch: {
      tags: ['Suppliers'],
      summary: 'Set supplier status',
      parameters: [pp('id', 'Supplier id')],
      requestBody: bodyRef('SetStatusBody', 'New status'),
      responses: { ...okData('Supplier', 'Updated supplier'), ...errorResponses },
    },
  },

  '/customers': {
    get: {
      tags: ['Customers'],
      summary: 'List customers',
      parameters: [
        ...pagination,
        qs('search', 'Search by name'),
        qe('status', ['active', 'inactive'], 'Filter by status'),
      ],
      responses: { ...okPaged('Customer', 'Paginated customers'), ...errorResponses },
    },
    post: {
      tags: ['Customers'],
      summary: 'Create a customer',
      requestBody: bodyRef('CustomerInput', 'Customer details'),
      responses: { ...okData('Customer', 'Created customer', null, { code: '201' }), ...errorResponsesNo404 },
    },
  },

  '/customers/{id}': {
    get: {
      tags: ['Customers'],
      summary: 'Get a customer',
      parameters: [pp('id', 'Customer id')],
      responses: { ...okData('Customer', 'Customer'), ...errorResponses },
    },
    put: {
      tags: ['Customers'],
      summary: 'Update a customer',
      parameters: [pp('id', 'Customer id')],
      requestBody: bodyRef('CustomerUpdate', 'Customer fields'),
      responses: { ...okData('Customer', 'Updated customer'), ...errorResponses },
    },
  },

  '/customers/{id}/status': {
    patch: {
      tags: ['Customers'],
      summary: 'Set customer status',
      parameters: [pp('id', 'Customer id')],
      requestBody: bodyRef('SetStatusBody', 'New status'),
      responses: { ...okData('Customer', 'Updated customer'), ...errorResponses },
    },
  },

  '/purchases': {
    get: {
      tags: ['Purchases'],
      summary: 'List purchases',
      parameters: [
        ...pagination,
        qs('search', 'Search by invoice number'),
        qi('supplierId', 'Filter by supplier'),
        qs('fromDate', 'Start date (ISO 8601)'),
        qs('toDate', 'End date (ISO 8601)'),
        qe('status', ['completed', 'cancelled'], 'Filter by status'),
      ],
      responses: { ...okPaged('Purchase', 'Paginated purchases'), ...errorResponses },
    },
    post: {
      tags: ['Purchases'],
      summary: 'Create a purchase',
      requestBody: bodyRef('PurchaseInput', 'Purchase details'),
      responses: { ...okData('Purchase', 'Created purchase', null, { code: '201' }), ...errorResponsesNo404 },
    },
  },

  '/purchases/{id}': {
    get: {
      tags: ['Purchases'],
      summary: 'Get a purchase',
      parameters: [pp('id', 'Purchase id')],
      responses: { ...okData('Purchase', 'Purchase'), ...errorResponses },
    },
  },

  '/purchases/{id}/status': {
    patch: {
      tags: ['Purchases'],
      summary: 'Set purchase status (completed / cancelled)',
      parameters: [pp('id', 'Purchase id')],
      requestBody: bodyRef('PurchaseSetStatus', 'New status'),
      responses: { ...okData('Purchase', 'Updated purchase'), ...errorResponses },
    },
  },

  '/stock': {
    get: {
      tags: ['Stock'],
      summary: 'List stock levels',
      parameters: [
        ...pagination,
        qs('search', 'Search by product name or code'),
        qe('productStatus', ['active', 'inactive'], 'Filter by product status'),
      ],
      responses: { ...okPaged('StockEntry', 'Paginated stock entries'), ...errorResponses },
    },
  },

  '/stock/{productId}': {
    get: {
      tags: ['Stock'],
      summary: 'Get stock level for a product',
      parameters: [pp('productId', 'Product id')],
      responses: { ...okData('StockEntry', 'Stock level'), ...errorResponses },
    },
  },

  '/stock/{productId}/transactions': {
    get: {
      tags: ['Stock'],
      summary: 'List stock transactions for a product',
      parameters: [
        pp('productId', 'Product id'),
        qe(
          'type',
          ['purchase', 'sale', 'return_purchase', 'return_sale', 'adjustment', 'cancellation_reversal'],
          'Filter by transaction type'
        ),
        qs('fromDate', 'Start date (ISO 8601)'),
        qs('toDate', 'End date (ISO 8601)'),
        ...pagination,
      ],
      responses: { ...okPaged('StockTransaction', 'Paginated transactions'), ...errorResponses },
    },
  },

  '/stock/{productId}/adjust': {
    patch: {
      tags: ['Stock'],
      summary: 'Adjust stock level for a product',
      parameters: [pp('productId', 'Product id')],
      requestBody: bodyRef('StockAdjust', 'Signed quantity delta and reason'),
      responses: { ...okData('StockTransaction', 'Created adjustment transaction'), ...errorResponses },
    },
  },

  '/sales': {
    get: {
      tags: ['Sales'],
      summary: 'List sales',
      parameters: [
        ...pagination,
        qs('search', 'Search by invoice number or customer name'),
        qi('customerId', 'Filter by customer'),
        qs('fromDate', 'Start date (ISO 8601)'),
        qs('toDate', 'End date (ISO 8601)'),
        qe('status', ['completed', 'cancelled', 'returned'], 'Filter by status'),
        qe('paymentType', ['cash', 'credit', 'partial'], 'Filter by payment type'),
      ],
      responses: { ...okPaged('Sale', 'Paginated sales'), ...errorResponses },
    },
    post: {
      tags: ['Sales'],
      summary: 'Create a sale',
      requestBody: bodyRef('SaleInput', 'Sale items and optional payments'),
      responses: {
        ...okData('Sale', 'Created sale', null, { code: '201' }),
        '400': errBody(true),
        '401': errBody(false),
        '403': errBody(false),
        '404': errBody(false),
        '409': errBody(false),
        '500': errBody(false),
      },
    },
  },

  '/sales/{id}': {
    get: {
      tags: ['Sales'],
      summary: 'Get a sale',
      parameters: [pp('id', 'Sale id')],
      responses: { ...okData('Sale', 'Sale'), ...errorResponses },
    },
  },

  '/sales/{saleId}/cancel': {
    patch: {
      tags: ['Sales'],
      summary: 'Cancel a sale (reverses stock, credit, and payments)',
      parameters: [pp('saleId', 'Sale id')],
      responses: { ...okData('Sale', 'Cancelled sale'), ...errorResponses },
    },
  },

  '/sales/{saleId}/return': {
    post: {
      tags: ['Sales'],
      summary: 'Return items on a sale',
      parameters: [pp('saleId', 'Sale id')],
      requestBody: bodyRef('ReturnSaleInput', 'Items being returned and optional reason'),
      responses: { ...okData('Sale', 'Updated sale'), ...errorResponses },
    },
  },

  '/credits': {
    get: {
      tags: ['Credits'],
      summary: 'List customer credit balances',
      parameters: [
        ...pagination,
        qs('search', 'Search by customer name'),
        qe('outstanding', ['true', 'false'], 'Only customers with outstanding balance'),
        qe('status', ['active', 'inactive'], 'Filter by customer status'),
      ],
      responses: { ...okPaged('Credit', 'Paginated credit balances'), ...errorResponses },
    },
    post: {
      tags: ['Credits'],
      summary: 'Create/open a credit account from a completed sale',
      requestBody: bodyRef('CreditCreate', 'saleId of the sale to fund'),
      responses: {
        ...okData('Credit', 'Credit account', null, { code: '201' }),
        '400': errBody(true),
        '401': errBody(false),
        '403': errBody(false),
        '404': errBody(false),
        '409': errBody(false),
        '500': errBody(false),
      },
    },
  },

  '/credits/{customerId}': {
    get: {
      tags: ['Credits'],
      summary: 'Get credit balance for a customer',
      parameters: [pp('customerId', 'Customer id')],
      responses: { ...okData('Credit', 'Credit balance'), ...errorResponses },
    },
  },

  '/credits/{customerId}/collect': {
    post: {
      tags: ['Credits'],
      summary: 'Record a payment collection against a customer credit',
      parameters: [pp('customerId', 'Customer id')],
      requestBody: bodyRef('CreditCollect', 'Payment details'),
      responses: { ...okData('CreditTransaction', 'Created collection transaction', null, { code: '201' }), ...errorResponses },
    },
  },

  '/credits/{customerId}/transactions': {
    get: {
      tags: ['Credits'],
      summary: 'List credit transactions for a customer',
      parameters: [pp('customerId', 'Customer id'), ...pagination],
      responses: { ...okPaged('CreditTransaction', 'Paginated transactions'), ...errorResponses },
    },
  },

  '/invoices': {
    get: {
      tags: ['Invoices'],
      summary: 'List invoices (sales history)',
      parameters: [
        ...pagination,
        qs('search', 'Search by invoice number'),
        qs('fromDate', 'Start date (ISO 8601)'),
        qs('toDate', 'End date (ISO 8601)'),
        qe('status', ['completed', 'cancelled', 'returned'], 'Filter by status'),
      ],
      responses: { ...okPaged('Invoice', 'Paginated invoices'), ...errorResponses },
    },
  },

  '/invoices/by-number/{invoiceNumber}': {
    get: {
      tags: ['Invoices'],
      summary: 'Get an invoice by its invoice number',
      parameters: [
        {
          name: 'invoiceNumber',
          in: 'path',
          required: true,
          description: 'Invoice number (max 50 chars)',
          schema: { type: 'string', maxLength: 50 },
        },
      ],
      responses: {
        ...okData('Invoice', 'Invoice', null, {
          example: {
            success: true,
            message: 'Success',
            data: {
              saleId: 1,
              invoiceNumber: 'INV-20260910-0001',
              saleDate: '2026-09-10T06:00:00.000Z',
              customerId: 1,
              customerName: 'Walk-in Customer',
              subtotal: 70,
              discount: 0,
              total: 70,
              paidAmount: 70,
              balanceDue: 0,
              status: 'completed',
              items: [
                {
                  id: 1,
                  productId: 1,
                  productName: 'Tomato',
                  quantity: 2,
                  unitPrice: 35,
                  discount: 0,
                  lineTotal: 70,
                },
              ],
            },
          },
        }),
        ...errorResponses,
      },
    },
  },

  '/invoices/{saleId}': {
    get: {
      tags: ['Invoices'],
      summary: 'Get an invoice by sale id',
      parameters: [pp('saleId', 'Sale id')],
      responses: { ...okData('Invoice', 'Invoice'), ...errorResponses },
    },
  },

  '/expenses': {
    get: {
      tags: ['Expenses'],
      summary: 'List expenses',
      parameters: [
        ...pagination,
        qs('search', 'Search by description'),
        qs('category', 'Filter by category'),
        qs('fromDate', 'Start date (ISO 8601)'),
        qs('toDate', 'End date (ISO 8601)'),
        qe('sortBy', ['id', 'date', 'amount', 'category'], 'Sort column'),
        qe('sortOrder', ['asc', 'desc'], 'Sort direction'),
      ],
      responses: { ...okPaged('Expense', 'Paginated expenses'), ...errorResponses },
    },
    post: {
      tags: ['Expenses'],
      summary: 'Create an expense',
      requestBody: bodyRef('ExpenseInput', 'Expense details'),
      responses: { ...okData('Expense', 'Created expense', null, { code: '201' }), ...errorResponsesNo404 },
    },
  },

  '/expenses/{id}': {
    get: {
      tags: ['Expenses'],
      summary: 'Get an expense',
      parameters: [pp('id', 'Expense id')],
      responses: { ...okData('Expense', 'Expense'), ...errorResponses },
    },
    patch: {
      tags: ['Expenses'],
      summary: 'Update an expense',
      parameters: [pp('id', 'Expense id')],
      requestBody: bodyRef('ExpenseUpdate', 'Expense fields'),
      responses: { ...okData('Expense', 'Updated expense'), ...errorResponses },
    },
  },

  '/income': {
    get: {
      tags: ['Income'],
      summary: 'List income entries',
      parameters: [
        ...pagination,
        qs('search', 'Search by description'),
        qs('category', 'Filter by category'),
        qs('fromDate', 'Start date (ISO 8601)'),
        qs('toDate', 'End date (ISO 8601)'),
        qe('sortBy', ['id', 'date', 'amount', 'category'], 'Sort column'),
        qe('sortOrder', ['asc', 'desc'], 'Sort direction'),
      ],
      responses: { ...okPaged('Income', 'Paginated income entries'), ...errorResponses },
    },
    post: {
      tags: ['Income'],
      summary: 'Create an income entry',
      requestBody: bodyRef('IncomeInput', 'Income details'),
      responses: { ...okData('Income', 'Created income entry', null, { code: '201' }), ...errorResponsesNo404 },
    },
  },

  '/income/{id}': {
    get: {
      tags: ['Income'],
      summary: 'Get an income entry',
      parameters: [pp('id', 'Income entry id')],
      responses: { ...okData('Income', 'Income entry'), ...errorResponses },
    },
    patch: {
      tags: ['Income'],
      summary: 'Update an income entry',
      parameters: [pp('id', 'Income entry id')],
      requestBody: bodyRef('IncomeUpdate', 'Income fields'),
      responses: { ...okData('Income', 'Updated income entry'), ...errorResponses },
    },
  },

  '/profit': {
    get: {
      tags: ['Profit'],
      summary: 'Profit and loss summary for a date range',
      parameters: [
        qs('fromDate', 'Start date (ISO 8601)'),
        qs('toDate', 'End date (ISO 8601)'),
      ],
      responses: { ...okData('ProfitSummary', 'Profit summary'), ...errorResponses },
    },
  },

  '/reports/sales': {
    get: {
      tags: ['Reports'],
      summary: 'Sales report',
      parameters: [
        ...commonParams,
        qe('sortBy', ['date', 'total', 'status', 'id'], 'Sort column'),
        qe('status', ['completed', 'cancelled', 'returned'], 'Filter by status'),
        qe('paymentType', ['cash', 'credit', 'partial'], 'Filter by payment type'),
        qi('customerId', 'Filter by customer'),
        qs('fromDate', 'Start date (ISO 8601)'),
        qs('toDate', 'End date (ISO 8601)'),
        qs('search', 'Search'),
      ],
      responses: { ...okPaged('ReportRow', 'Paginated sales report rows'), ...errorResponses },
    },
  },

  '/reports/purchases': {
    get: {
      tags: ['Reports'],
      summary: 'Purchases report',
      parameters: [
        ...commonParams,
        qe('sortBy', ['date', 'total', 'supplier', 'id'], 'Sort column'),
        qe('status', ['completed', 'cancelled'], 'Filter by status'),
        qi('supplierId', 'Filter by supplier'),
        qs('fromDate', 'Start date (ISO 8601)'),
        qs('toDate', 'End date (ISO 8601)'),
        qs('search', 'Search'),
      ],
      responses: { ...okPaged('ReportRow', 'Paginated purchases report rows'), ...errorResponses },
    },
  },

  '/reports/expenses': {
    get: {
      tags: ['Reports'],
      summary: 'Expenses report',
      parameters: [
        ...commonParams,
        qe('sortBy', ['date', 'amount', 'category', 'id'], 'Sort column'),
        qs('category', 'Filter by category'),
        qs('fromDate', 'Start date (ISO 8601)'),
        qs('toDate', 'End date (ISO 8601)'),
      ],
      responses: { ...okPaged('ReportRow', 'Paginated expenses report rows'), ...errorResponses },
    },
  },

  '/reports/income': {
    get: {
      tags: ['Reports'],
      summary: 'Income report',
      parameters: [
        ...commonParams,
        qe('sortBy', ['date', 'amount', 'category', 'id'], 'Sort column'),
        qs('category', 'Filter by category'),
        qs('fromDate', 'Start date (ISO 8601)'),
        qs('toDate', 'End date (ISO 8601)'),
      ],
      responses: { ...okPaged('ReportRow', 'Paginated income report rows'), ...errorResponses },
    },
  },

  '/reports/profit': {
    get: {
      tags: ['Reports'],
      summary: 'Profit report',
      parameters: [qs('fromDate', 'Start date (ISO 8601)'), qs('toDate', 'End date (ISO 8601)')],
      responses: {
        ...okRawData('Profit summary', ref('ProfitSummary')),
        ...errorResponses,
      },
    },
  },

  '/reports/stock': {
    get: {
      tags: ['Reports'],
      summary: 'Stock report',
      parameters: [
        ...commonParams,
        qe('sortBy', ['name', 'sku', 'current', 'id'], 'Sort column'),
        qi('categoryId', 'Filter by category'),
        qs('fromDate', 'Start date (ISO 8601)'),
        qs('toDate', 'End date (ISO 8601)'),
      ],
      responses: { ...okPaged('ReportRow', 'Paginated stock report rows'), ...errorResponses },
    },
  },

  '/reports/credit': {
    get: {
      tags: ['Reports'],
      summary: 'Credit report',
      parameters: [
        ...commonParams,
        qe('sortBy', ['balance', 'name', 'id'], 'Sort column'),
        qi('customerId', 'Filter by customer'),
        qe('status', ['active', 'inactive'], 'Filter by customer status'),
        qs('fromDate', 'Start date (ISO 8601)'),
        qs('toDate', 'End date (ISO 8601)'),
      ],
      responses: { ...okPaged('ReportRow', 'Paginated credit report rows'), ...errorResponses },
    },
  },

  '/reports/customers': {
    get: {
      tags: ['Reports'],
      summary: 'Customer sales report',
      parameters: [
        ...commonParams,
        qe('sortBy', ['name', 'gross', 'salesCount'], 'Sort column'),
        qs('fromDate', 'Start date (ISO 8601)'),
        qs('toDate', 'End date (ISO 8601)'),
      ],
      responses: { ...okPaged('ReportRow', 'Paginated customer report rows'), ...errorResponses },
    },
  },

  '/reports/products': {
    get: {
      tags: ['Reports'],
      summary: 'Product sales report',
      parameters: [
        ...commonParams,
        qe('sortBy', ['name', 'gross', 'quantitySold'], 'Sort column'),
        qi('categoryId', 'Filter by category'),
        qs('fromDate', 'Start date (ISO 8601)'),
        qs('toDate', 'End date (ISO 8601)'),
        qs('search', 'Search'),
      ],
      responses: { ...okPaged('ReportRow', 'Paginated product report rows'), ...errorResponses },
    },
  },

  '/reports/suppliers': {
    get: {
      tags: ['Reports'],
      summary: 'Supplier purchases report',
      parameters: [
        ...commonParams,
        qe('sortBy', ['name', 'total', 'purchaseCount'], 'Sort column'),
        qs('fromDate', 'Start date (ISO 8601)'),
        qs('toDate', 'End date (ISO 8601)'),
      ],
      responses: { ...okPaged('ReportRow', 'Paginated supplier report rows'), ...errorResponses },
    },
  },

  '/dashboard': {
    get: {
      tags: ['Dashboard'],
      summary: 'Dashboard summary for a date range',
      parameters: [
        qs('fromDate', 'Start date (ISO 8601)'),
        qs('toDate', 'End date (ISO 8601)'),
        qi('top', 'Number of top entries (1-20)', { min: 1, max: 20 }),
      ],
      responses: {
        ...okData('Dashboard', 'Dashboard summary', null, {
          example: {
            success: true,
            message: 'Success',
            data: {
              period: { fromDate: '2026-09-10', toDate: '2026-09-10' },
              sales: {
                grossSalesRevenue: 700,
                returnedAmount: 0,
                netSalesRevenue: 700,
                saleCount: 1,
                completedSaleCount: 1,
                returnedSaleCount: 0,
                cancelledSaleCount: 0,
                cashReceived: 700,
                creditSales: 0,
                outstandingFromSales: 0,
              },
              purchases: { purchaseCount: 1, completedPurchaseCount: 1, cancelledPurchaseCount: 0, purchaseAmount: 210, purchasedQuantity: 10.5 },
              profit: {
                grossSalesRevenue: 700,
                returnedAmount: 0,
                netSalesRevenue: 700,
                cogs: 210,
                grossProfit: 490,
                expenses: 0,
                otherIncome: 0,
                netProfit: 490,
                cashReceived: 700,
                creditOutstanding: 0,
              },
              expenses: { total: 0, count: 0 },
              income: { total: 0, count: 0 },
              stock: {
                totalProductsWithStock: 1,
                totalQuantityOnHand: 8.5,
                lowStockCount: 0,
                purchaseQuantity: 10.5,
                soldQuantity: 2,
                returnedQuantity: 0,
                cancellationReversalQuantity: 0,
                adjustmentQuantity: 0,
              },
              credit: { creditSales: 0, creditCollections: 0, creditReversals: 0, currentOutstanding: 0, customersWithOutstanding: 0 },
              topProducts: [{ id: 1, name: 'Tomato', quantitySold: 2, revenue: 70 }],
              topCustomers: [{ id: 1, name: 'Walk-in Customer', salesCount: 1, amount: 70 }],
              recentSales: [],
              recentPurchases: [],
            },
          },
        }),
        ...errorResponses,
      },
    },
  },

  '/settings': {
    get: {
      tags: ['Settings'],
      summary: 'List settings',
      responses: {
        ...okRawData('List of settings', { type: 'array', items: ref('Setting') }),
        ...errorResponses,
      },
    },
  },

  '/settings/{key}': {
    get: {
      tags: ['Settings'],
      summary: 'Get a setting by key',
      parameters: [
        {
          name: 'key',
          in: 'path',
          required: true,
          description: 'Setting key (max 100 chars)',
          schema: { type: 'string', maxLength: 100 },
        },
      ],
      responses: { ...okData('Setting', 'Setting'), ...errorResponses },
    },
    put: {
      tags: ['Settings'],
      summary: 'Create or update a setting',
      parameters: [
        {
          name: 'key',
          in: 'path',
          required: true,
          description: 'Setting key (max 100 chars)',
          schema: { type: 'string', maxLength: 100 },
        },
      ],
      requestBody: bodyRef('SettingUpdate', 'Value (string) and optional description'),
      responses: { ...okData('Setting', 'Saved setting'), ...errorResponses },
    },
  },

  '/health': {
    get: {
      tags: ['Health'],
      summary: 'Service health check (unversioned, public, unauthenticated)',
      security: [],
      servers: [{ url: '/' }],
      responses: {
        ...okRawData('Health status', {
          type: 'object',
          properties: {
            status: { type: 'string' },
            database: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        }),
        '500': errBody(false),
      },
    },
  },
};

const components = {
  securitySchemes: {
    bearerAuth: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    },
  },
  schemas: {
    PaginationMeta: {
      type: 'object',
      properties: {
        page: { type: 'integer', example: 1 },
        limit: { type: 'integer', example: 20 },
        total: { type: 'integer', example: 0 },
        totalPages: { type: 'integer', example: 0 },
      },
    },
    Money: {
      type: 'number',
      description:
        'Money amount. Computed figures are returned as JSON numbers; raw DECIMAL columns may be serialized as strings (e.g. "0.00").',
      example: 12.5,
    },
    LoginRequest: {
      type: 'object',
      required: ['username', 'password'],
      properties: {
        username: { type: 'string', example: 'admin' },
        password: { type: 'string', example: 'ChangeMe123!' },
      },
    },
    LoginResponseData: {
      type: 'object',
      properties: {
        token: { type: 'string', description: 'JWT bearer token' },
        user: ref('User'),
      },
    },
    User: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        username: { type: 'string' },
        fullName: { type: 'string' },
        email: { type: ['string', 'null'] },
        phone: { type: ['string', 'null'] },
        roleId: { type: 'integer' },
        roleName: { type: 'string' },
        status: { type: 'string', enum: ['active', 'inactive', 'suspended'] },
        isAdmin: { type: 'boolean' },
        permissions: { type: 'array', items: { type: 'string' } },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
    CreateUser: {
      type: 'object',
      required: ['username', 'password', 'fullName', 'roleId'],
      properties: {
        username: { type: 'string', minLength: 3, maxLength: 50, pattern: '^[a-zA-Z0-9._-]+$' },
        password: { type: 'string', minLength: 8 },
        fullName: { type: 'string' },
        email: { type: ['string', 'null'] },
        phone: { type: ['string', 'null'], maxLength: 20 },
        roleId: { type: 'integer', minimum: 1 },
        permissions: { type: 'array', items: { type: 'string' }, description: 'Optional list of permission codes' },
      },
    },
    UpdateUser: {
      type: 'object',
      properties: {
        fullName: { type: 'string' },
        email: { type: ['string', 'null'] },
        phone: { type: ['string', 'null'], maxLength: 20 },
        roleId: { type: 'integer', minimum: 1 },
      },
    },
    SetUserStatus: {
      type: 'object',
      required: ['status'],
      properties: {
        status: { type: 'string', enum: ['active', 'inactive', 'suspended'] },
      },
    },
    SetUserPermissions: {
      type: 'object',
      required: ['permissions'],
      properties: {
        permissions: { type: 'array', items: { type: 'string' }, description: 'Permission codes to assign' },
      },
    },
    Role: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        isSystem: { type: 'boolean' },
      },
    },
    Permission: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        description: { type: 'string' },
      },
    },
    SetStatusBody: {
      type: 'object',
      required: ['status'],
      properties: {
        status: { type: 'string', enum: ['active', 'inactive'] },
      },
    },
    Category: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        description: { type: ['string', 'null'] },
        status: { type: 'string', enum: ['active', 'inactive'] },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
    CategoryInput: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', maxLength: 100 },
        description: { type: ['string', 'null'], maxLength: 255 },
      },
      example: { name: 'Vegetables', description: 'Fresh produce and greens' },
    },
    CategoryUpdate: {
      type: 'object',
      properties: {
        name: { type: 'string', maxLength: 100 },
        description: { type: ['string', 'null'], maxLength: 255 },
      },
    },
    Product: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        productCode: { type: 'string' },
        name: { type: 'string' },
        categoryId: { type: 'integer' },
        categoryName: { type: 'string' },
        unit: { type: 'string', enum: ['kg', 'g', 'piece', 'dozen', 'bunch', 'litre'] },
        purchasePrice: ref('Money'),
        sellingPrice: ref('Money'),
        currentStock: ref('Money'),
        minimumStock: ref('Money'),
        status: { type: 'string', enum: ['active', 'inactive'] },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
    ProductInput: {
      type: 'object',
      required: ['productCode', 'name', 'categoryId', 'unit', 'purchasePrice', 'sellingPrice'],
      properties: {
        productCode: { type: 'string', maxLength: 50 },
        name: { type: 'string', maxLength: 150 },
        categoryId: { type: 'integer', minimum: 1 },
        unit: { type: 'string', enum: ['kg', 'g', 'piece', 'dozen', 'bunch', 'litre'] },
        purchasePrice: { type: 'number', minimum: 0 },
        sellingPrice: { type: 'number', minimum: 0 },
        currentStock: { type: 'number', minimum: 0 },
        minimumStock: { type: 'number', minimum: 0 },
      },
      example: {
        productCode: 'TOM-001',
        name: 'Tomato',
        categoryId: 1,
        unit: 'kg',
        purchasePrice: 20,
        sellingPrice: 35,
        currentStock: 10.5,
        minimumStock: 5,
      },
    },
    ProductUpdate: {
      type: 'object',
      required: ['name', 'categoryId', 'unit', 'purchasePrice', 'sellingPrice', 'currentStock', 'minimumStock'],
      properties: {
        name: { type: 'string', maxLength: 150 },
        categoryId: { type: 'integer', minimum: 1 },
        unit: { type: 'string', enum: ['kg', 'g', 'piece', 'dozen', 'bunch', 'litre'] },
        purchasePrice: { type: 'number', minimum: 0 },
        sellingPrice: { type: 'number', minimum: 0 },
        currentStock: { type: 'number', minimum: 0 },
        minimumStock: { type: 'number', minimum: 0 },
      },
    },
    ProductVariant: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        productId: { type: 'integer' },
        name: { type: 'string' },
        purchasePrice: ref('Money'),
        sellingPrice: ref('Money'),
        status: { type: 'string', enum: ['active', 'inactive'] },
      },
    },
    ProductVariantInput: {
      type: 'object',
      required: ['name', 'purchasePrice', 'sellingPrice'],
      properties: {
        name: { type: 'string', maxLength: 100 },
        purchasePrice: { type: 'number', minimum: 0 },
        sellingPrice: { type: 'number', minimum: 0 },
      },
    },
    Supplier: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        contactPerson: { type: ['string', 'null'] },
        phone: { type: ['string', 'null'] },
        email: { type: ['string', 'null'] },
        address: { type: ['string', 'null'] },
        status: { type: 'string', enum: ['active', 'inactive'] },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
    SupplierInput: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', maxLength: 150 },
        contactPerson: { type: ['string', 'null'], maxLength: 100 },
        phone: { type: ['string', 'null'], maxLength: 20 },
        email: { type: ['string', 'null'] },
        address: { type: ['string', 'null'], maxLength: 255 },
      },
    },
    SupplierUpdate: {
      type: 'object',
      properties: {
        name: { type: 'string', maxLength: 150 },
        contactPerson: { type: ['string', 'null'], maxLength: 100 },
        phone: { type: ['string', 'null'], maxLength: 20 },
        email: { type: ['string', 'null'] },
        address: { type: ['string', 'null'], maxLength: 255 },
      },
    },
    Customer: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        phone: { type: ['string', 'null'] },
        email: { type: ['string', 'null'] },
        address: { type: ['string', 'null'] },
        creditLimit: ref('Money'),
        currentBalance: ref('Money'),
        totalCredit: ref('Money'),
        totalPaid: ref('Money'),
        status: { type: 'string', enum: ['active', 'inactive'] },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
    CustomerInput: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', maxLength: 150 },
        phone: { type: ['string', 'null'], maxLength: 20 },
        email: { type: ['string', 'null'] },
        address: { type: ['string', 'null'], maxLength: 255 },
        creditLimit: { type: 'number', minimum: 0 },
      },
    },
    CustomerUpdate: {
      type: 'object',
      properties: {
        name: { type: 'string', maxLength: 150 },
        phone: { type: ['string', 'null'], maxLength: 20 },
        email: { type: ['string', 'null'] },
        address: { type: ['string', 'null'], maxLength: 255 },
        creditLimit: { type: 'number', minimum: 0 },
      },
    },
    PurchaseItemInput: {
      type: 'object',
      required: ['productId', 'quantity', 'purchasePrice'],
      properties: {
        productId: { type: 'integer', minimum: 1 },
        quantity: { type: 'number', exclusiveMinimum: 0 },
        purchasePrice: { type: 'number', minimum: 0 },
      },
    },
    PurchaseInput: {
      type: 'object',
      required: ['supplierId', 'invoiceNumber', 'purchaseDate', 'items'],
      properties: {
        supplierId: { type: 'integer', minimum: 1 },
        invoiceNumber: { type: 'string', maxLength: 50 },
        purchaseDate: { type: 'string', format: 'date-time' },
        notes: { type: ['string', 'null'], maxLength: 255 },
        items: { type: 'array', minItems: 1, maxItems: 200, items: ref('PurchaseItemInput') },
      },
    },
    PurchaseItem: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        productId: { type: 'integer' },
        productName: { type: 'string' },
        quantity: ref('Money'),
        purchasePrice: ref('Money'),
        lineTotal: ref('Money'),
      },
    },
    Purchase: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        invoiceNumber: { type: 'string' },
        supplierId: { type: 'integer' },
        supplierName: { type: 'string' },
        purchaseDate: { type: 'string', format: 'date-time' },
        total: ref('Money'),
        notes: { type: ['string', 'null'] },
        status: { type: 'string', enum: ['completed', 'cancelled'] },
        items: { type: 'array', items: ref('PurchaseItem') },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
    PurchaseSetStatus: {
      type: 'object',
      required: ['status'],
      properties: {
        status: { type: 'string', enum: ['completed', 'cancelled'] },
      },
    },
    StockEntry: {
      type: 'object',
      properties: {
        productId: { type: 'integer' },
        productCode: { type: 'string' },
        productName: { type: 'string' },
        currentStock: ref('Money'),
        minimumStock: ref('Money'),
        status: { type: 'string', enum: ['active', 'inactive'] },
      },
    },
    StockAdjust: {
      type: 'object',
      required: ['delta', 'note'],
      properties: {
        delta: { type: 'number', description: 'Signed change to stock (positive adds, negative reduces)' },
        note: { type: 'string', maxLength: 255, description: 'Reason for the change' },
      },
    },
    StockTransaction: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        productId: { type: 'integer' },
        productName: { type: 'string' },
        type: {
          type: 'string',
          enum: ['purchase', 'sale', 'return_purchase', 'return_sale', 'adjustment', 'cancellation_reversal'],
        },
        quantity: ref('Money'),
        note: { type: ['string', 'null'] },
        referenceId: { type: ['integer', 'null'] },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
    SaleItemInput: {
      type: 'object',
      required: ['productId', 'quantity'],
      properties: {
        productId: { type: 'integer', minimum: 1 },
        quantity: { type: 'number', exclusiveMinimum: 0 },
        discount: { type: 'number', minimum: 0 },
      },
    },
    PaymentInput: {
      type: 'object',
      required: ['method', 'amount'],
      properties: {
        method: { type: 'string', enum: ['cash', 'card', 'upi', 'bank_transfer', 'other'] },
        amount: { type: 'number', exclusiveMinimum: 0 },
        notes: { type: ['string', 'null'], maxLength: 255 },
      },
    },
    SaleInput: {
      type: 'object',
      required: ['items'],
      properties: {
        customerId: { type: ['integer', 'null'], minimum: 1 },
        saleDate: { type: ['string', 'null'], format: 'date-time' },
        discount: { type: 'number', minimum: 0 },
        items: { type: 'array', minItems: 1, maxItems: 200, items: ref('SaleItemInput') },
        payments: { type: 'array', maxItems: 20, items: ref('PaymentInput') },
      },
      example: {
        customerId: 1,
        saleDate: '2026-09-10T10:30:00.000Z',
        discount: 0,
        items: [{ productId: 1, quantity: 2, discount: 0 }],
        payments: [{ method: 'cash', amount: 70, notes: 'Paid in full' }],
      },
    },
    SaleItem: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        productId: { type: 'integer' },
        productName: { type: 'string' },
        quantity: ref('Money'),
        unitPrice: ref('Money'),
        discount: ref('Money'),
        lineTotal: ref('Money'),
      },
    },
    Sale: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        saleId: { type: 'integer' },
        invoiceNumber: { type: 'string' },
        saleDate: { type: 'string', format: 'date-time' },
        customerId: { type: ['integer', 'null'] },
        customerName: { type: ['string', 'null'] },
        subtotal: ref('Money'),
        discount: ref('Money'),
        total: ref('Money'),
        paidAmount: ref('Money'),
        balanceDue: ref('Money'),
        paymentType: { type: 'string', enum: ['cash', 'credit', 'partial'] },
        status: { type: 'string', enum: ['completed', 'cancelled', 'returned'] },
        items: { type: 'array', items: ref('SaleItem') },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
    ReturnItemInput: {
      type: 'object',
      required: ['productId', 'quantity'],
      properties: {
        productId: { type: 'integer', minimum: 1 },
        quantity: { type: 'number', exclusiveMinimum: 0 },
      },
    },
    ReturnSaleInput: {
      type: 'object',
      required: ['items'],
      properties: {
        reason: { type: ['string', 'null'], maxLength: 255 },
        items: { type: 'array', minItems: 1, maxItems: 200, items: ref('ReturnItemInput') },
      },
    },
    Credit: {
      type: 'object',
      properties: {
        customerId: { type: 'integer' },
        customerName: { type: 'string' },
        creditLimit: ref('Money'),
        currentBalance: ref('Money'),
        totalCredit: ref('Money'),
        totalPaid: ref('Money'),
        status: { type: 'string', enum: ['active', 'inactive'] },
      },
    },
    CreditCreate: {
      type: 'object',
      required: ['saleId'],
      properties: {
        saleId: { type: 'integer', minimum: 1, description: 'Sale whose outstanding balance opens the credit account' },
      },
    },
    CreditCollect: {
      type: 'object',
      required: ['amount', 'method'],
      properties: {
        amount: { type: 'number', exclusiveMinimum: 0 },
        method: { type: 'string', enum: ['cash', 'card', 'upi', 'bank_transfer', 'other'] },
        notes: { type: ['string', 'null'], maxLength: 255 },
      },
    },
    CreditTransaction: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        customerId: { type: 'integer' },
        type: { type: 'string', description: 'credit movement type (sale, collection, reversal, sale_return)' },
        amount: ref('Money'),
        paymentMethod: { type: ['string', 'null'] },
        notes: { type: ['string', 'null'] },
        referenceSaleId: { type: ['integer', 'null'] },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
    Invoice: {
      type: 'object',
      properties: {
        saleId: { type: 'integer' },
        invoiceNumber: { type: 'string' },
        saleDate: { type: 'string', format: 'date-time' },
        customerId: { type: ['integer', 'null'] },
        customerName: { type: ['string', 'null'] },
        subtotal: ref('Money'),
        discount: ref('Money'),
        total: ref('Money'),
        paidAmount: ref('Money'),
        balanceDue: ref('Money'),
        status: { type: 'string', enum: ['completed', 'cancelled', 'returned'] },
        items: { type: 'array', items: ref('SaleItem') },
      },
    },
    Expense: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        category: { type: 'string' },
        description: { type: ['string', 'null'] },
        amount: ref('Money'),
        expenseDate: { type: 'string', format: 'date-time' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
    ExpenseInput: {
      type: 'object',
      required: ['category', 'amount'],
      properties: {
        category: { type: 'string', maxLength: 50 },
        description: { type: ['string', 'null'], maxLength: 255 },
        amount: { type: 'number', exclusiveMinimum: 0 },
        expenseDate: { type: ['string', 'null'], format: 'date-time' },
      },
    },
    ExpenseUpdate: {
      type: 'object',
      properties: {
        category: { type: 'string', maxLength: 50 },
        description: { type: ['string', 'null'], maxLength: 255 },
        amount: { type: 'number', exclusiveMinimum: 0 },
        expenseDate: { type: ['string', 'null'], format: 'date-time' },
      },
    },
    Income: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        category: { type: 'string' },
        description: { type: ['string', 'null'] },
        amount: ref('Money'),
        incomeDate: { type: 'string', format: 'date-time' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
    IncomeInput: {
      type: 'object',
      required: ['category', 'amount'],
      properties: {
        category: { type: 'string', maxLength: 50 },
        description: { type: ['string', 'null'], maxLength: 255 },
        amount: { type: 'number', exclusiveMinimum: 0 },
        incomeDate: { type: ['string', 'null'], format: 'date-time' },
      },
    },
    IncomeUpdate: {
      type: 'object',
      properties: {
        category: { type: 'string', maxLength: 50 },
        description: { type: ['string', 'null'], maxLength: 255 },
        amount: { type: 'number', exclusiveMinimum: 0 },
        incomeDate: { type: ['string', 'null'], format: 'date-time' },
      },
    },
    ProfitSummary: {
      type: 'object',
      description: 'Profit & loss computed between startDate and endDate inclusive.',
      properties: {
        startDate: { type: 'string', format: 'date' },
        endDate: { type: 'string', format: 'date' },
        revenue: ref('Money'),
        costOfGoodsSold: ref('Money'),
        grossProfit: ref('Money'),
        grossMarginPct: { type: 'number' },
        expenses: ref('Money'),
        income: ref('Money'),
        netProfit: ref('Money'),
        netMarginPct: { type: 'number' },
      },
    },
    Dashboard: {
      type: 'object',
      description: 'Dashboard rollup for a date range.',
      properties: {
        summary: { type: 'object', additionalProperties: true },
        topProducts: { type: 'array', items: { type: 'object', additionalProperties: true } },
        recentSales: { type: 'array', items: ref('Sale') },
        lowStock: { type: 'array', items: ref('StockEntry') },
      },
    },
    ReportRow: {
      type: 'object',
      description: 'Report row shape varies per report endpoint.',
      additionalProperties: true,
    },
    Setting: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        value: { type: 'string' },
        description: { type: ['string', 'null'] },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
    SettingUpdate: {
      type: 'object',
      required: ['value'],
      properties: {
        value: { type: 'string' },
        description: { type: ['string', 'null'], maxLength: 255 },
      },
    },
  },
};

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Vegetable Shop POS API',
    version: '1.0.0',
    description:
      'REST API for the Vegetable Shop POS. Every endpoint (except /health and POST /auth/login) requires a JWT bearer token; most endpoints also require a specific permission code. All responses use the envelope { success, message, data, meta? }. Dates use ISO 8601.',
    contact: { name: 'Vegetable Shop POS' },
  },
  servers: [{ url: '/api/v1', description: 'Versioned business API base' }],
  tags: [
    { name: 'Auth', description: 'Authentication and session' },
    { name: 'Users', description: 'User administration' },
    { name: 'Roles & Permissions', description: 'Role and permission catalogs' },
    { name: 'Categories', description: 'Product categories' },
    { name: 'Products & Variants', description: 'Products and their variants' },
    { name: 'Suppliers', description: 'Suppliers' },
    { name: 'Customers', description: 'Customers' },
    { name: 'Purchases', description: 'Purchase orders and stock intake' },
    { name: 'Stock', description: 'Stock levels and movements' },
    { name: 'Sales', description: 'Sales, cancellation, returns' },
    { name: 'Credits', description: 'Customer credit accounts' },
    { name: 'Invoices', description: 'Read-only invoices over sales history' },
    { name: 'Expenses', description: 'Expense tracking' },
    { name: 'Income', description: 'Additional income tracking' },
    { name: 'Profit', description: 'Profit and loss' },
    { name: 'Reports', description: 'Aggregate reports' },
    { name: 'Dashboard', description: 'Dashboard rollups' },
    { name: 'Settings', description: 'Key-value settings' },
    { name: 'Health', description: 'Service health' },
  ],
  paths,
  security: [{ bearerAuth: [] }],
  components,
};