import { debuglog } from 'util';

import { IHookFunctions, IWebhookFunctions } from 'n8n-core';

import {
	IDataObject,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	IWebhookResponseData,
	NodeApiError,
	NodeOperationError,
} from 'n8n-workflow';

import { pagerDutyApiRequest, pagerDutyApiRequestAllItems } from './GenericFunctions';

const debug = debuglog('n8n-nodes-pagerduty-trigger');

const NODE_NAME = 'PagerDuty Trigger';

export class PagerDutyTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: NODE_NAME,
		name: 'pagerDutyTrigger',
		icon: 'file:pagerDuty.svg',
		group: ['trigger'],
		version: 1,
		description: 'Starts the workflow when PagerDuty events occur',
		subtitle: `={{"${NODE_NAME}"}}`,
		defaults: {
			name: NODE_NAME,
		},
		inputs: [],
		outputs: ['main'],
		credentials: [
			{
				name: 'pagerDutyApi',
				required: true,
				displayOptions: {
					show: {
						authentication: ['apiToken'],
					},
				},
			},
			{
				name: 'pagerDutyOAuth2Api',
				required: true,
				displayOptions: {
					show: {
						authentication: ['oAuth2'],
					},
				},
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Authentication',
				name: 'authentication',
				type: 'options',
				options: [
					{
						name: 'API Token',
						value: 'apiToken',
					},
					{
						name: 'OAuth2',
						value: 'oAuth2',
					},
				],
				default: 'apiToken',
			},
			{
				displayName: 'Scope',
				name: 'filter',
				type: 'options',
				default: 'account_reference',
				description: 'Limit the events to a specific service or team. By default, events for the entire account are returned.',
				options: [
					{
						name: 'Service',
						value: 'service_reference',
						description: 'Limit the events to a specific service',
					},
					{
						name: 'Team',
						value: 'team_reference',
						description: 'Limit the events to a specific team',
					},
					{
						name: 'Account',
						value: 'account_reference',
						description: 'Receive events from everything in the account',
					},
				],
			},
			{
				displayName: 'Team Name or ID',
				name: 'teamId',
				type: 'options',
				description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code-examples/expressions/">expression</a>',
				default: '',
				typeOptions: {
					loadOptionsMethod: 'getTeams',
				},
				required: true,
				displayOptions: {
					show: {
						filter: ['team_reference'],
					},
				},
			},
			{
				displayName: 'Service Name or ID',
				name: 'serviceId',
				type: 'options',
				description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code-examples/expressions/">expression</a>',
				default: '',
				typeOptions: {
					loadOptionsMethod: 'getServices',
				},
				required: true,
				displayOptions: {
					show: {
						filter: ['service_reference'],
					},
				},
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				options: [
					{
						name: 'Incident Acknowledged',
						value: 'incident.acknowledged',
						description: 'Triggered when an incident is acknowledged',
					},
					{
						name: 'Incident Annotated',
						value: 'incident.annotated',
						description: 'Triggered when a note is added to an incident',
					},
					{
						name: 'Incident Delegated',
						value: 'incident.delegated',
						description: 'Triggered when an incident has been reassigned to another escalation policy',
					},
					{
						name: 'Incident Escalated',
						value: 'incident.escalated',
						description: 'Triggered when an incident has been escalated to another user in the same escalation level',
					},
					{
						name: 'Incident Priority Updated',
						value: 'incident.priority_updated',
						description: 'Triggered when the priority of an incident has changed',
					},
					{
						name: 'Incident Reassigned',
						value: 'incident.reassigned',
						description: 'Triggered when an incident has been reassigned to another user',
					},
					{
						name: 'Incident Reopened',
						value: 'incident.reopened',
						description: 'Triggered when an incident is reopened',
					},
					{
						name: 'Incident Resolved',
						value: 'incident.resolved',

						description: 'Triggered when an incident has been resolved',
					},
					{
						name: 'Incident Responder Added',
						value: 'incident.responder.added',
						description: 'Triggered when a responder has been added to an incident',
					},
					{
						name: 'Incident Responder Replied',
						value: 'incident.responder.replied',
						description: 'Triggered when a responder replies to a request',
					},
					{
						name: 'Incident Status Update Published',
						value: 'incident.status_update_published',
						description: 'Triggered when a status update is added to an incident',
					},
					{
						name: 'Incident Triggered',
						value: 'incident.triggered',
						description: 'Triggered when an incident is newly created/triggered',
					},
					{
						name: 'Incident Unacknowledged',
						value: 'incident.unacknowledged',
						description: 'Triggered when an incident is unacknowledged',
					},
					{
						name: 'Service Created',
						value: 'service.created',
						description: 'Triggered when a service is created',
					},
					{
						name: 'Service Deleted',
						value: 'service.deleted',
						description: 'Triggered when a service is deleted',
					},
					{
						name: 'Service Updated',
						value: 'service.updated',
						description: 'Triggered when a service is updated',
					},
				],
				required: true,
				default: [],
				description: 'Which event types will trigger the node. A subset of all <a href="https://developer.pagerduty.com/docs/ZG9jOjQ1MTg4ODQ0-overview#event-types">event types</a> may be provided if the destination is only interested in a limited set of events.',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				description: 'Options to set',
				default: {},
				options: [
					{
						displayName: 'Custom Headers',
						name: 'customHeaders',
						placeholder: 'Add Header',
						type: 'fixedCollection',
						typeOptions: {
							multipleValues: true,
						},
						description: 'Optional headers to be set on the events when sent. The header values are redacted in GET requests, but are not redacted on the event when delivered.',
						default: {},
						options: [
							{
								name: 'parameter',
								displayName: 'Header',
								values: [
									{
										displayName: 'Name',
										name: 'name',
										type: 'string',
										default: '',
										description: 'Name of the header',
									},
									{
										displayName: 'Value',
										name: 'value',
										type: 'string',
										default: '',
										description: 'Value to set for the header',
									},
								],
							},
						],
					},
					{
						displayName: 'Include Headers and Query Parameters',
						name: 'fullRequest',
						type: 'boolean',
						default: false,
						description:
							'Whether to return the full request (headers and query parameters) in addition to the body',
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			async getServices(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const returnData: INodePropertyOptions[] = [];
				const services = await pagerDutyApiRequestAllItems.call(
					this,
					'services',
					'GET',
					'/services',
				);
				for (const service of services) {
					const serviceName = service.name;
					const serviceId = service.id;
					returnData.push({
						name: serviceName,
						value: serviceId,
					});
				}
				return returnData;
			},
			async getTeams(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const returnData: INodePropertyOptions[] = [];
				const teams = await pagerDutyApiRequestAllItems.call(
					this,
					'teams',
					'GET',
					'/teams',
				);
				for (const team of teams) {
					const teamName = team.name;
					const teamId = team.id;
					returnData.push({
						name: teamName,
						value: teamId,
					});
				}
				return returnData;
			},
		},
	};

	// @ts-ignore (because of request)
	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');

				if (webhookData.webhookId === undefined) {
					// No webhook id is set so no webhook can exist
					return false;
				}

				// Webhook got created before so check if it still exists
				try {
					await pagerDutyApiRequest.call(
						this,
						'GET',
						`/webhook_subscriptions/${webhookData.webhookId}`,
					);
				} catch (error) {
					if (error.httpCode === '404') {
						// Webhook does not exist
						delete webhookData.webhookId;
						delete webhookData.webhookEvents;

						return false;
					}

					// Some error occured
					throw error;
				}

				// If it did not error then the webhook exists
				return true;
			},
			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default') as string;
				if (webhookUrl.includes('//localhost')) {
					throw new NodeOperationError(
						this.getNode(),
						'The Webhook can not work on "localhost". Please, either setup n8n on a custom domain or start with "--tunnel"!',
					);
				}

				const description = this.getNode().name as string;
				const workflowName = this.getWorkflow().name as string;
				const events = this.getNodeParameter('events', []);
				const options = this.getNodeParameter('options', {}) as IDataObject;
				const customHeaders = options.customHeaders as IDataObject;
				const filter = this.getNodeParameter('filter', 'account_reference') as string;

				let id;
				if (filter === 'team_reference') {
					id = this.getNodeParameter('teamId', '') as string;
				} else if (filter === 'service_reference') {
					id = this.getNodeParameter('serviceId', '') as string;
				}

				const body = {
					webhook_subscription: {
						type: 'webhook_subscription',
						active: true,
						delivery_method: {
							type: 'http_delivery_method',
							url: webhookUrl,
							custom_headers: customHeaders?.parameter || [],
						},
						description: `[N8N] ${description} in ${workflowName}`,
						events,
						filter: {
							type: filter,
							...(filter !== 'account_reference' ? { id }: {}),
						},
					},
				};

				debug('body', body);

				const webhookData = this.getWorkflowStaticData('node');

				let rawResponse;
				try {
					rawResponse = await pagerDutyApiRequest.call(this, 'POST', '/webhook_subscriptions', body);
				} catch (error) {
					debug('Error creating webhook subscription:', error.stack);
					throw error;
				}

				const responseData = rawResponse?.webhook_subscription || {};
				debug(responseData);
				if (responseData.id === undefined || responseData.active !== true) {
					// Required data is missing so was not successful
					throw new NodeApiError(this.getNode(), responseData, {
						message: 'PagerDuty webhook subscription response did not contain the expected data.',
					});
				}

				webhookData.webhookId = responseData.id as string;
				webhookData.webhookEvents = responseData.events as string[];

				return true;
			},
			async delete(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');

				if (webhookData.webhookId !== undefined) {
					try {
						await pagerDutyApiRequest.call(this, 'DELETE', `/webhook_subscriptions/${webhookData.webhookId}`);
					} catch (error) {
						return false;
					}

					// Remove from the static workflow data so that it is clear
					// that no webhooks are registred anymore
					delete webhookData.webhookId;
					delete webhookData.webhookEvents;
				}

				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const bodyData = this.getBodyData();
		const options = this.getNodeParameter('options', {}) as IDataObject;
		const headersObj = options.customHeaders as IDataObject || {};
		const customHeaders = headersObj.parameter as IDataObject[] || [];

		// Check if the webhook is only the ping from Github to confirm if it workshook_id
		if (bodyData.hook_id !== undefined && bodyData.action === undefined) {
			// Is only the ping and not an actual webhook call. So return 'OK'
			// but do not start the workflow.

			return {
				webhookResponse: 'OK',
			};
		}

		// Is a regular webhook call
		const returnData: IDataObject[] = [];
		const shouldReturnFullRequest = options.fullRequest as boolean || customHeaders.length > 0;

		returnData.push(shouldReturnFullRequest ? ({
			body: bodyData,
			headers: this.getHeaderData(),
			query: this.getQueryData(),
		}) : bodyData);

		return {
			workflowData: [this.helpers.returnJsonArray(returnData)],
		};
	}
}
