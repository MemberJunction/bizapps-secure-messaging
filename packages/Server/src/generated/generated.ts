/********************************************************************************
* ALL ENTITIES - TypeGraphQL Type Class Definition - AUTO GENERATED FILE
* Generated Entities and Resolvers for Server
*
*   >>> DO NOT MODIFY THIS FILE!!!!!!!!!!!!
*   >>> YOUR CHANGES WILL BE OVERWRITTEN
*   >>> THE NEXT TIME THIS FILE IS GENERATED
*
**********************************************************************************/
import { Arg, Ctx, Int, Query, Resolver, Field, Float, ObjectType, FieldResolver, Root, InputType, Mutation,
            PubSub, PubSubEngine, ResolverBase, RunViewByIDInput, RunViewByNameInput, RunDynamicViewInput,
            AppContext, KeyValuePairInput, DeleteOptionsInput, GraphQLTimestamp as Timestamp,
            GetReadOnlyProvider, GetReadWriteProvider, RestoreContextInput } from '@memberjunction/server';
import { Metadata, EntityPermissionType, CompositeKey, UserInfo } from '@memberjunction/core'

import { MaxLength } from 'class-validator';
import * as mj_core_schema_server_object_types from '@memberjunction/server'


import { mjBizAppsSecureMessagingFileRequestEntity, mjBizAppsSecureMessagingMessageFileEntity, mjBizAppsSecureMessagingPortalMagicLinkEntity, mjBizAppsSecureMessagingPortalSessionEntity, mjBizAppsSecureMessagingSecureMessageEntity } from '@mj-biz-apps/secure-messaging-entities';
    

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_SecureMessaging: File Requests
//****************************************************************************
@ObjectType({ description: `A request from staff for the external contact to securely upload one or more files. Fulfilled by uploading files (stored as MessageFile rows) and setting Status to Fulfilled.` })
export class mjBizAppsSecureMessagingFileRequest_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    PortalSessionID: string;
        
    @Field() 
    @MaxLength(255)
    ThreadID: string;
        
    @Field() 
    @MaxLength(255)
    Title: string;
        
    @Field({nullable: true}) 
    Instructions?: string;
        
    @Field({description: `Request lifecycle status: Pending, Fulfilled, or Cancelled.`}) 
    @MaxLength(20)
    Status: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RequestedByUserID?: string;
        
    @Field({nullable: true}) 
    DueAt?: Date;
        
    @Field({nullable: true}) 
    FulfilledAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_SecureMessaging: File Requests
//****************************************************************************
@InputType()
export class CreatemjBizAppsSecureMessagingFileRequestInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    PortalSessionID?: string;

    @Field({ nullable: true })
    ThreadID?: string;

    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    Instructions: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    RequestedByUserID: string | null;

    @Field({ nullable: true })
    DueAt: Date | null;

    @Field({ nullable: true })
    FulfilledAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_SecureMessaging: File Requests
//****************************************************************************
@InputType()
export class UpdatemjBizAppsSecureMessagingFileRequestInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    PortalSessionID?: string;

    @Field({ nullable: true })
    ThreadID?: string;

    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    Instructions?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    RequestedByUserID?: string | null;

    @Field({ nullable: true })
    DueAt?: Date | null;

    @Field({ nullable: true })
    FulfilledAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_SecureMessaging: File Requests
//****************************************************************************
@ObjectType()
export class RunmjBizAppsSecureMessagingFileRequestViewResult {
    @Field(() => [mjBizAppsSecureMessagingFileRequest_])
    Results: mjBizAppsSecureMessagingFileRequest_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsSecureMessagingFileRequest_)
export class mjBizAppsSecureMessagingFileRequestResolver extends ResolverBase {
    @Query(() => RunmjBizAppsSecureMessagingFileRequestViewResult)
    async RunmjBizAppsSecureMessagingFileRequestViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsSecureMessagingFileRequestViewResult)
    async RunmjBizAppsSecureMessagingFileRequestViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsSecureMessagingFileRequestViewResult)
    async RunmjBizAppsSecureMessagingFileRequestDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_SecureMessaging: File Requests';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsSecureMessagingFileRequest_, { nullable: true })
    async mjBizAppsSecureMessagingFileRequest(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsSecureMessagingFileRequest_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_SecureMessaging: File Requests', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsSecureMessaging', 'vwFileRequests')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_SecureMessaging: File Requests', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_SecureMessaging: File Requests', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsSecureMessagingFileRequest_)
    async CreatemjBizAppsSecureMessagingFileRequest(
        @Arg('input', () => CreatemjBizAppsSecureMessagingFileRequestInput) input: CreatemjBizAppsSecureMessagingFileRequestInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_SecureMessaging: File Requests', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsSecureMessagingFileRequest_)
    async UpdatemjBizAppsSecureMessagingFileRequest(
        @Arg('input', () => UpdatemjBizAppsSecureMessagingFileRequestInput) input: UpdatemjBizAppsSecureMessagingFileRequestInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_SecureMessaging: File Requests', input, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_SecureMessaging: Message Files
//****************************************************************************
@ObjectType({ description: `Links an uploaded file to a secure message. Bytes are stored in core MJ File Storage (MJ: Files) and wrapped as an MJ Artifact; this table holds references and display metadata only.` })
export class mjBizAppsSecureMessagingMessageFile_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    SecureMessageID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ExternalMessageID?: string;
        
    @Field() 
    @MaxLength(255)
    ThreadID: string;
        
    @Field({nullable: true, description: `Soft reference to MJ: Artifacts.ID wrapping the uploaded file.`}) 
    @MaxLength(36)
    ArtifactID?: string;
        
    @Field({nullable: true, description: `Soft reference to MJ: Files.ID holding the bytes in the configured storage provider.`}) 
    @MaxLength(36)
    FileID?: string;
        
    @Field() 
    @MaxLength(500)
    Filename: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    ContentType?: string;
        
    @Field(() => Int, {nullable: true}) 
    Size?: number;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_SecureMessaging: Message Files
//****************************************************************************
@InputType()
export class CreatemjBizAppsSecureMessagingMessageFileInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    SecureMessageID: string | null;

    @Field({ nullable: true })
    ExternalMessageID: string | null;

    @Field({ nullable: true })
    ThreadID?: string;

    @Field({ nullable: true })
    ArtifactID: string | null;

    @Field({ nullable: true })
    FileID: string | null;

    @Field({ nullable: true })
    Filename?: string;

    @Field({ nullable: true })
    ContentType: string | null;

    @Field(() => Int, { nullable: true })
    Size: number | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_SecureMessaging: Message Files
//****************************************************************************
@InputType()
export class UpdatemjBizAppsSecureMessagingMessageFileInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    SecureMessageID?: string | null;

    @Field({ nullable: true })
    ExternalMessageID?: string | null;

    @Field({ nullable: true })
    ThreadID?: string;

    @Field({ nullable: true })
    ArtifactID?: string | null;

    @Field({ nullable: true })
    FileID?: string | null;

    @Field({ nullable: true })
    Filename?: string;

    @Field({ nullable: true })
    ContentType?: string | null;

    @Field(() => Int, { nullable: true })
    Size?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_SecureMessaging: Message Files
//****************************************************************************
@ObjectType()
export class RunmjBizAppsSecureMessagingMessageFileViewResult {
    @Field(() => [mjBizAppsSecureMessagingMessageFile_])
    Results: mjBizAppsSecureMessagingMessageFile_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsSecureMessagingMessageFile_)
export class mjBizAppsSecureMessagingMessageFileResolver extends ResolverBase {
    @Query(() => RunmjBizAppsSecureMessagingMessageFileViewResult)
    async RunmjBizAppsSecureMessagingMessageFileViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsSecureMessagingMessageFileViewResult)
    async RunmjBizAppsSecureMessagingMessageFileViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsSecureMessagingMessageFileViewResult)
    async RunmjBizAppsSecureMessagingMessageFileDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_SecureMessaging: Message Files';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsSecureMessagingMessageFile_, { nullable: true })
    async mjBizAppsSecureMessagingMessageFile(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsSecureMessagingMessageFile_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_SecureMessaging: Message Files', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsSecureMessaging', 'vwMessageFiles')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_SecureMessaging: Message Files', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_SecureMessaging: Message Files', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsSecureMessagingMessageFile_)
    async CreatemjBizAppsSecureMessagingMessageFile(
        @Arg('input', () => CreatemjBizAppsSecureMessagingMessageFileInput) input: CreatemjBizAppsSecureMessagingMessageFileInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_SecureMessaging: Message Files', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsSecureMessagingMessageFile_)
    async UpdatemjBizAppsSecureMessagingMessageFile(
        @Arg('input', () => UpdatemjBizAppsSecureMessagingMessageFileInput) input: UpdatemjBizAppsSecureMessagingMessageFileInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_SecureMessaging: Message Files', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsSecureMessagingMessageFile_)
    async DeletemjBizAppsSecureMessagingMessageFile(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_SecureMessaging: Message Files', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_SecureMessaging: Portal Magic Links
//****************************************************************************
@ObjectType({ description: `Single-use magic links for re-authenticating expired portal sessions. Short-lived (15 min default), redeems into a fresh session token.` })
export class mjBizAppsSecureMessagingPortalMagicLink_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    PortalSessionID: string;
        
    @Field({description: `SHA-256 hash of the magic link token (sm_ml_ prefix). Raw token is never stored.`}) 
    @MaxLength(128)
    TokenHash: string;
        
    @Field({description: `Magic link lifecycle status: Pending, Used, or Expired`}) 
    @MaxLength(20)
    Status: string;
        
    @Field({description: `When the magic link expires. Default is 15 minutes from creation.`}) 
    ExpiresAt: Date;
        
    @Field({nullable: true, description: `Timestamp when the magic link was redeemed. NULL if not yet used.`}) 
    UsedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_SecureMessaging: Portal Magic Links
//****************************************************************************
@InputType()
export class CreatemjBizAppsSecureMessagingPortalMagicLinkInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    PortalSessionID?: string;

    @Field({ nullable: true })
    TokenHash?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    ExpiresAt?: Date;

    @Field({ nullable: true })
    UsedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_SecureMessaging: Portal Magic Links
//****************************************************************************
@InputType()
export class UpdatemjBizAppsSecureMessagingPortalMagicLinkInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    PortalSessionID?: string;

    @Field({ nullable: true })
    TokenHash?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    ExpiresAt?: Date;

    @Field({ nullable: true })
    UsedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_SecureMessaging: Portal Magic Links
//****************************************************************************
@ObjectType()
export class RunmjBizAppsSecureMessagingPortalMagicLinkViewResult {
    @Field(() => [mjBizAppsSecureMessagingPortalMagicLink_])
    Results: mjBizAppsSecureMessagingPortalMagicLink_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsSecureMessagingPortalMagicLink_)
export class mjBizAppsSecureMessagingPortalMagicLinkResolver extends ResolverBase {
    @Query(() => RunmjBizAppsSecureMessagingPortalMagicLinkViewResult)
    async RunmjBizAppsSecureMessagingPortalMagicLinkViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsSecureMessagingPortalMagicLinkViewResult)
    async RunmjBizAppsSecureMessagingPortalMagicLinkViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsSecureMessagingPortalMagicLinkViewResult)
    async RunmjBizAppsSecureMessagingPortalMagicLinkDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_SecureMessaging: Portal Magic Links';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsSecureMessagingPortalMagicLink_, { nullable: true })
    async mjBizAppsSecureMessagingPortalMagicLink(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsSecureMessagingPortalMagicLink_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_SecureMessaging: Portal Magic Links', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsSecureMessaging', 'vwPortalMagicLinks')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_SecureMessaging: Portal Magic Links', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_SecureMessaging: Portal Magic Links', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsSecureMessagingPortalMagicLink_)
    async CreatemjBizAppsSecureMessagingPortalMagicLink(
        @Arg('input', () => CreatemjBizAppsSecureMessagingPortalMagicLinkInput) input: CreatemjBizAppsSecureMessagingPortalMagicLinkInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_SecureMessaging: Portal Magic Links', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsSecureMessagingPortalMagicLink_)
    async UpdatemjBizAppsSecureMessagingPortalMagicLink(
        @Arg('input', () => UpdatemjBizAppsSecureMessagingPortalMagicLinkInput) input: UpdatemjBizAppsSecureMessagingPortalMagicLinkInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_SecureMessaging: Portal Magic Links', input, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_SecureMessaging: Portal Sessions
//****************************************************************************
@ObjectType({ description: `Tracks active secure messaging sessions for external contacts. Each session maps a contact to a channel thread and is authenticated via a hashed opaque token.` })
export class mjBizAppsSecureMessagingPortalSession_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    ChannelID: string;
        
    @Field() 
    @MaxLength(36)
    ContactID: string;
        
    @Field({description: `Groups messages into a conversation thread`}) 
    @MaxLength(255)
    ThreadID: string;
        
    @Field({description: `SHA-256 hash of the opaque session token (sm_ prefix). Raw token is never stored.`}) 
    @MaxLength(128)
    TokenHash: string;
        
    @Field({description: `Session lifecycle status: Active, Expired, or Revoked`}) 
    @MaxLength(20)
    Status: string;
        
    @Field({description: `When the session token expires. Default TTL is 7 days, extended on each access.`}) 
    ExpiresAt: Date;
        
    @Field({description: `Last time the session was accessed. Used for session extension and cleanup.`}) 
    LastAccessedAt: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => Boolean, {description: `When 1, this conversation (thread) is archived: hidden from the staff inbox default view and shown under the Archived category. Staff-toggled; does not affect contact access.`}) 
    IsArchived: boolean;
        
    @Field(() => Boolean, {description: `When 1, this conversation (thread) is soft-deleted: hidden from the inbox and all categories except Trash, from which it can be restored. Records are never hard-deleted (compliance/audit). Staff-toggled.`}) 
    IsDeleted: boolean;
        
    @Field(() => [mjBizAppsSecureMessagingPortalMagicLink_])
    mjBizAppsSecureMessagingMJ_BizApps_SecureMessaging_PortalMagicLinks_PortalSessionIDArray: mjBizAppsSecureMessagingPortalMagicLink_[]; // Link to mjBizAppsSecureMessagingMJ_BizApps_SecureMessaging_PortalMagicLinks
    
    @Field(() => [mjBizAppsSecureMessagingFileRequest_])
    mjBizAppsSecureMessagingMJ_BizApps_SecureMessaging_FileRequests_PortalSessionIDArray: mjBizAppsSecureMessagingFileRequest_[]; // Link to mjBizAppsSecureMessagingMJ_BizApps_SecureMessaging_FileRequests
    
    @Field(() => [mjBizAppsSecureMessagingSecureMessage_])
    mjBizAppsSecureMessagingMJ_BizApps_SecureMessaging_SecureMessages_PortalSessionIDArray: mjBizAppsSecureMessagingSecureMessage_[]; // Link to mjBizAppsSecureMessagingMJ_BizApps_SecureMessaging_SecureMessages
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_SecureMessaging: Portal Sessions
//****************************************************************************
@InputType()
export class CreatemjBizAppsSecureMessagingPortalSessionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ChannelID?: string;

    @Field({ nullable: true })
    ContactID?: string;

    @Field({ nullable: true })
    ThreadID?: string;

    @Field({ nullable: true })
    TokenHash?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    ExpiresAt?: Date;

    @Field({ nullable: true })
    LastAccessedAt?: Date;

    @Field(() => Boolean, { nullable: true })
    IsArchived?: boolean;

    @Field(() => Boolean, { nullable: true })
    IsDeleted?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_SecureMessaging: Portal Sessions
//****************************************************************************
@InputType()
export class UpdatemjBizAppsSecureMessagingPortalSessionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ChannelID?: string;

    @Field({ nullable: true })
    ContactID?: string;

    @Field({ nullable: true })
    ThreadID?: string;

    @Field({ nullable: true })
    TokenHash?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    ExpiresAt?: Date;

    @Field({ nullable: true })
    LastAccessedAt?: Date;

    @Field(() => Boolean, { nullable: true })
    IsArchived?: boolean;

    @Field(() => Boolean, { nullable: true })
    IsDeleted?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_SecureMessaging: Portal Sessions
//****************************************************************************
@ObjectType()
export class RunmjBizAppsSecureMessagingPortalSessionViewResult {
    @Field(() => [mjBizAppsSecureMessagingPortalSession_])
    Results: mjBizAppsSecureMessagingPortalSession_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsSecureMessagingPortalSession_)
export class mjBizAppsSecureMessagingPortalSessionResolver extends ResolverBase {
    @Query(() => RunmjBizAppsSecureMessagingPortalSessionViewResult)
    async RunmjBizAppsSecureMessagingPortalSessionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsSecureMessagingPortalSessionViewResult)
    async RunmjBizAppsSecureMessagingPortalSessionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsSecureMessagingPortalSessionViewResult)
    async RunmjBizAppsSecureMessagingPortalSessionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_SecureMessaging: Portal Sessions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsSecureMessagingPortalSession_, { nullable: true })
    async mjBizAppsSecureMessagingPortalSession(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsSecureMessagingPortalSession_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_SecureMessaging: Portal Sessions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsSecureMessaging', 'vwPortalSessions')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_SecureMessaging: Portal Sessions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_SecureMessaging: Portal Sessions', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsSecureMessagingPortalMagicLink_])
    async mjBizAppsSecureMessagingMJ_BizApps_SecureMessaging_PortalMagicLinks_PortalSessionIDArray(@Root() mjbizappssecuremessagingportalsession_: mjBizAppsSecureMessagingPortalSession_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_SecureMessaging: Portal Magic Links', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsSecureMessaging', 'vwPortalMagicLinks')} WHERE ${provider.QuoteIdentifier('PortalSessionID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_SecureMessaging: Portal Magic Links', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappssecuremessagingportalsession_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_SecureMessaging: Portal Magic Links', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsSecureMessagingFileRequest_])
    async mjBizAppsSecureMessagingMJ_BizApps_SecureMessaging_FileRequests_PortalSessionIDArray(@Root() mjbizappssecuremessagingportalsession_: mjBizAppsSecureMessagingPortalSession_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_SecureMessaging: File Requests', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsSecureMessaging', 'vwFileRequests')} WHERE ${provider.QuoteIdentifier('PortalSessionID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_SecureMessaging: File Requests', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappssecuremessagingportalsession_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_SecureMessaging: File Requests', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsSecureMessagingSecureMessage_])
    async mjBizAppsSecureMessagingMJ_BizApps_SecureMessaging_SecureMessages_PortalSessionIDArray(@Root() mjbizappssecuremessagingportalsession_: mjBizAppsSecureMessagingPortalSession_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_SecureMessaging: Secure Messages', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsSecureMessaging', 'vwSecureMessages')} WHERE ${provider.QuoteIdentifier('PortalSessionID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_SecureMessaging: Secure Messages', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappssecuremessagingportalsession_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_SecureMessaging: Secure Messages', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsSecureMessagingPortalSession_)
    async CreatemjBizAppsSecureMessagingPortalSession(
        @Arg('input', () => CreatemjBizAppsSecureMessagingPortalSessionInput) input: CreatemjBizAppsSecureMessagingPortalSessionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_SecureMessaging: Portal Sessions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsSecureMessagingPortalSession_)
    async UpdatemjBizAppsSecureMessagingPortalSession(
        @Arg('input', () => UpdatemjBizAppsSecureMessagingPortalSessionInput) input: UpdatemjBizAppsSecureMessagingPortalSessionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_SecureMessaging: Portal Sessions', input, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_SecureMessaging: Secure Messages
//****************************************************************************
@ObjectType({ description: `Self-contained secure message store. Each row is one inbound or outbound message in a thread. App-agnostic: does not require an external Channel Messages entity.` })
export class mjBizAppsSecureMessagingSecureMessage_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    PortalSessionID: string;
        
    @Field() 
    @MaxLength(255)
    ThreadID: string;
        
    @Field({nullable: true, description: `Soft reference to the person (e.g. MJ_BizApps_Common.People.ID). Not a hard FK so the schema stays standalone.`}) 
    @MaxLength(36)
    PersonID?: string;
        
    @Field({description: `Direction of the message relative to the organization: Inbound (from contact) or Outbound (reply to contact).`}) 
    @MaxLength(20)
    Direction: string;
        
    @Field() 
    @MaxLength(255)
    Sender: string;
        
    @Field() 
    @MaxLength(255)
    Recipient: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Subject?: string;
        
    @Field() 
    Content: string;
        
    @Field(() => Boolean) 
    IsSecure: boolean;
        
    @Field() 
    @MaxLength(20)
    Status: string;
        
    @Field({nullable: true, description: `When the Channel Messages adapter is active, holds the mirrored Channel Message ID so the AI pipeline can process the message. NULL in the self-contained path.`}) 
    @MaxLength(36)
    ExternalMessageID?: string;
        
    @Field() 
    ReceivedAt: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => Boolean, {description: `When 1, this message is starred/flagged by staff for quick retrieval (shown under the Starred category). Per-message, staff-toggled.`}) 
    IsStarred: boolean;
        
    @Field(() => [mjBizAppsSecureMessagingMessageFile_])
    mjBizAppsSecureMessagingMJ_BizApps_SecureMessaging_MessageFiles_SecureMessageIDArray: mjBizAppsSecureMessagingMessageFile_[]; // Link to mjBizAppsSecureMessagingMJ_BizApps_SecureMessaging_MessageFiles
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_SecureMessaging: Secure Messages
//****************************************************************************
@InputType()
export class CreatemjBizAppsSecureMessagingSecureMessageInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    PortalSessionID?: string;

    @Field({ nullable: true })
    ThreadID?: string;

    @Field({ nullable: true })
    PersonID: string | null;

    @Field({ nullable: true })
    Direction?: string;

    @Field({ nullable: true })
    Sender?: string;

    @Field({ nullable: true })
    Recipient?: string;

    @Field({ nullable: true })
    Subject: string | null;

    @Field({ nullable: true })
    Content?: string;

    @Field(() => Boolean, { nullable: true })
    IsSecure?: boolean;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    ExternalMessageID: string | null;

    @Field({ nullable: true })
    ReceivedAt?: Date;

    @Field(() => Boolean, { nullable: true })
    IsStarred?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_SecureMessaging: Secure Messages
//****************************************************************************
@InputType()
export class UpdatemjBizAppsSecureMessagingSecureMessageInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    PortalSessionID?: string;

    @Field({ nullable: true })
    ThreadID?: string;

    @Field({ nullable: true })
    PersonID?: string | null;

    @Field({ nullable: true })
    Direction?: string;

    @Field({ nullable: true })
    Sender?: string;

    @Field({ nullable: true })
    Recipient?: string;

    @Field({ nullable: true })
    Subject?: string | null;

    @Field({ nullable: true })
    Content?: string;

    @Field(() => Boolean, { nullable: true })
    IsSecure?: boolean;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    ExternalMessageID?: string | null;

    @Field({ nullable: true })
    ReceivedAt?: Date;

    @Field(() => Boolean, { nullable: true })
    IsStarred?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_SecureMessaging: Secure Messages
//****************************************************************************
@ObjectType()
export class RunmjBizAppsSecureMessagingSecureMessageViewResult {
    @Field(() => [mjBizAppsSecureMessagingSecureMessage_])
    Results: mjBizAppsSecureMessagingSecureMessage_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsSecureMessagingSecureMessage_)
export class mjBizAppsSecureMessagingSecureMessageResolver extends ResolverBase {
    @Query(() => RunmjBizAppsSecureMessagingSecureMessageViewResult)
    async RunmjBizAppsSecureMessagingSecureMessageViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsSecureMessagingSecureMessageViewResult)
    async RunmjBizAppsSecureMessagingSecureMessageViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsSecureMessagingSecureMessageViewResult)
    async RunmjBizAppsSecureMessagingSecureMessageDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_SecureMessaging: Secure Messages';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsSecureMessagingSecureMessage_, { nullable: true })
    async mjBizAppsSecureMessagingSecureMessage(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsSecureMessagingSecureMessage_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_SecureMessaging: Secure Messages', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsSecureMessaging', 'vwSecureMessages')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_SecureMessaging: Secure Messages', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_SecureMessaging: Secure Messages', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsSecureMessagingMessageFile_])
    async mjBizAppsSecureMessagingMJ_BizApps_SecureMessaging_MessageFiles_SecureMessageIDArray(@Root() mjbizappssecuremessagingsecuremessage_: mjBizAppsSecureMessagingSecureMessage_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_SecureMessaging: Message Files', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsSecureMessaging', 'vwMessageFiles')} WHERE ${provider.QuoteIdentifier('SecureMessageID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_SecureMessaging: Message Files', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappssecuremessagingsecuremessage_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_SecureMessaging: Message Files', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsSecureMessagingSecureMessage_)
    async CreatemjBizAppsSecureMessagingSecureMessage(
        @Arg('input', () => CreatemjBizAppsSecureMessagingSecureMessageInput) input: CreatemjBizAppsSecureMessagingSecureMessageInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_SecureMessaging: Secure Messages', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsSecureMessagingSecureMessage_)
    async UpdatemjBizAppsSecureMessagingSecureMessage(
        @Arg('input', () => UpdatemjBizAppsSecureMessagingSecureMessageInput) input: UpdatemjBizAppsSecureMessagingSecureMessageInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_SecureMessaging: Secure Messages', input, provider, userPayload, pubSub);
    }
    
}