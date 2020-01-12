import { ZeppelinPlugin, trimPluginDescription } from "./ZeppelinPlugin";
import * as t from "io-ts";
import { tNullable } from "../utils";
import { decorators as d, IPluginOptions, logger, waitForReaction, waitForReply } from "knub";
import { Attachment, Constants as ErisConstants, Guild, Member, Message, TextChannel, User } from "eris";
import { GuildLogs } from "../data/GuildLogs";

const ConfigSchema = t.type({
    can_assign: t.boolean,
    assignable_roles: tNullable(t.array(t.string))
  });  
type TConfigSchema = t.TypeOf<typeof ConfigSchema>;

enum RoleActions{
    Add = 1,
    Remove
};
  
export class RolesPlugin extends ZeppelinPlugin<TConfigSchema> {
  public static pluginName = "roles";
  public static configSchema = ConfigSchema;

  public static pluginInfo = {
    prettyName: "Roles",
    description: trimPluginDescription(`
      Enables authorised users to add and remove whitelisted roles with a command.
    `),
  };
  protected logs: GuildLogs;

  onLoad(){
    this.logs = new GuildLogs(this.guildId);
  }

  public static getStaticDefaultOptions(): IPluginOptions<TConfigSchema> {
    return {
      config: {
        can_assign: false,
        assignable_roles: null
      },
      overrides: [
        {
          level: ">=50",
          config: {
            can_assign: true,
          },
        },
      ],
    };
  }


  @d.command("role", "<action:string> <user:string> [role:string$]",{
      extra: {
        info: {
          description: "Assign a permitted role to a user",
        },
      },
    })
  @d.permission("can_assign")
  async assignRole(msg: Message, args: {action: string; user: string; role: string}){
    const user = await this.resolveUser(args.user);
    const roleId = await this.resolveRoleId(args.role);
    if (user.discriminator == "0000") {
      return this.sendErrorMessage(msg.channel, `User not found`);
    }

    //if the role doesnt exist, we can exit
    let roleIds = (msg.channel as TextChannel).guild.roles.map(x => x.id)
    if(!(roleIds.includes(roleId))){
      return this.sendErrorMessage(msg.channel, `Role not found`);
    } 

    // If the user exists as a guild member, make sure we can act on them first
    const targetMember = await this.getMember(user.id);
    if (targetMember && !this.canActOn(msg.member, targetMember)) {
      this.sendErrorMessage(msg.channel, "Cannot add or remove roles on this user: insufficient permissions");
      return;
    }

    const action: string = args.action[0].toUpperCase() + args.action.slice(1).toLowerCase();
    if(!RoleActions[action]){
      this.sendErrorMessage(msg.channel, "Cannot add or remove roles on this user: invalid action");
      return;
    }

    //check if the role is allowed to be applied
    let config = this.getConfigForMsg(msg)
    if(!config.assignable_roles || !config.assignable_roles.includes(roleId)){
      this.sendErrorMessage(msg.channel, "You do not have access to the specified role");
      return;
    }
    //at this point, everything has been verified, so it's ACTION TIME
    switch(RoleActions[action]){
      case RoleActions.Add:
        if(targetMember.roles.includes(roleId)){
          this.sendErrorMessage(msg.channel, "Role already applied to user");
          return;
        }
        await this.bot.addGuildMemberRole(this.guildId, user.id, roleId);
        this.sendSuccessMessage(msg.channel, `Role added to user!`);
        break;
      case RoleActions.Remove:
        if(!targetMember.roles.includes(roleId)){
          this.sendErrorMessage(msg.channel, "User does not have role");
          return;
        }
        await this.bot.removeGuildMemberRole(this.guildId, user.id, roleId);
        this.sendSuccessMessage(msg.channel, `Role removed from user!`);
        break;
      default:
        break;
    }
  }
    
}